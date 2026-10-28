import { randomUUID } from 'node:crypto'
import {
  assertAgentIdentity, assertWakePorts, parseWakeDecision,
  assertBoundedObservation, isConfirmedActionReceipt,
} from './contracts.mjs'
import { classifyActionOutcome } from './action-outcomes.mjs'

// Decisions are kept separately from failed attempts, so a verifier that
// keeps failing can never evict a confirmed or not-executed decision.
const MAX_DECISIONS = 100
const MAX_UNRESOLVED_ATTEMPTS = 20

// Bounded, secret-free failure diagnostics: never an exception message.
function failureDiagnostics(error) {
  const text = value => typeof value === 'string' && value ? value.slice(0, 64) : undefined
  return { name: text(error?.name) ?? 'Error', ...(text(error?.code) && { code: text(error.code) }) }
}

async function saveRecorded(store, state) {
  try { await store.save(state); return true } catch { return false }
}

function retainAudit(entries) {
  const latest = (resolved, max) => new Set(entries.filter(entry =>
    (entry.resolution !== 'unresolved') === resolved).slice(-max))
  const decisions = latest(true, MAX_DECISIONS)
  const attempts = latest(false, MAX_UNRESOLVED_ATTEMPTS)
  return entries.filter(entry => decisions.has(entry) || attempts.has(entry))
}

// A post-rename durability failure: the new state is visible but unconfirmed.
const replacedButNotDurable = error =>
  error?.code === 'STATE_DURABILITY_UNCONFIRMED' && error.replaced === true

// Audit identity of automatic completion recovery; never an operator's.
const COMPLETION_RECOVERY = 'ginger-tail:completion-recovery'
const COMPLETION_KEYS = new Set(['id', 'status', 'kind', 'at', 'reason', 'receipt'])
const ACTION_KIND = /^[a-z][a-z0-9_-]{0,63}$/ // as accepted by parseWakeDecision

// Only the exact record that completion phase 1 writes after a confirmed
// receipt from the trusted executor qualifies. Any other shape, a receipt
// already applied, or any reconciliation already recorded for this id
// (including a conflicting verdict) is left to resolvePendingAction.
function isRecoverableCompletion(state) {
  const pending = state.pendingAction
  const receipt = pending.receipt
  const history = state.reconciliations
  return pending.status === 'uncertain' && pending.reason === 'completion_pending' &&
    typeof pending.id === 'string' && pending.id.length > 0 && pending.id.length <= 128 &&
    typeof pending.kind === 'string' && ACTION_KIND.test(pending.kind) &&
    Object.keys(pending).every(key => COMPLETION_KEYS.has(key)) &&
    !!receipt && typeof receipt === 'object' && !Array.isArray(receipt) &&
    Object.keys(receipt).length === 1 &&
    isConfirmedActionReceipt({ status: 'confirmed', receiptId: receipt.receiptId }) &&
    state.lastReceipt?.actionId !== pending.id &&
    (history === undefined ||
      (Array.isArray(history) && !history.some(entry => entry?.actionId === pending.id)))
}

// Completion phase 2 for a receipt that phase 1 already made durable (the
// store's barrier confirms what load returns). The world is never called.
// The clear and its audit entry are one atomic write, so recovery is
// idempotent: until that write is durable, the same record is recovered
// again. A failed save rejects; the action stays blocked, or is cleared
// but unconfirmed exactly as after a failed phase 2.
async function recoverCompletion(store, state, now) {
  const { id: actionId, kind, receipt: { receiptId } } = state.pendingAction
  const entry = { actionId, kind, previousStatus: 'uncertain', previousReason: 'completion_pending',
                  resolution: 'confirmed', receiptId, automatic: true,
                  resolvedBy: COMPLETION_RECOVERY, at: now() }
  await store.save({ ...state, pendingAction: null, lastOutcome: 'recovered',
                     lastReceipt: { actionId, receiptId, kind },
                     reconciliations: retainAudit([...(state.reconciliations ?? []), entry]) })
  return { outcome: 'recovered', actionId, receiptId, kind, wakes: state.wakes }
}

// Cancels waiting on a side-effect-free port; the abandoned call cannot
// influence this wake after rejection. The port is not invoked at all once
// aborted, and its promise is always handled.
function abortable(call, signal) {
  if (!signal) return call()
  signal.throwIfAborted()
  const value = Promise.resolve(call())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    value.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export async function runWake({ identity, store, world, decide, authorize = async () => false,
                                now = () => new Date().toISOString(), actionId = randomUUID,
                                signal }) {
  assertAgentIdentity(identity)
  assertWakePorts({ store, world, decide, authorize })
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError('Invalid abort signal')
  signal?.throwIfAborted()

  return store.withLock(async () => {
    const previous = await store.load()
    if (previous.agentId !== identity.id) throw new Error('Agent identity mismatch')
    if (previous.pendingAction) {
      if (isRecoverableCompletion(previous)) return recoverCompletion(store, previous, now)
      return { outcome: 'blocked', reason: 'unresolved_action',
               actionId: previous.pendingAction.id }
    }

    const observation = await abortable(
      () => world.observe({ identity, state: structuredClone(previous), signal }), signal)
    assertBoundedObservation(observation)
    const decision = parseWakeDecision(await abortable(
      () => decide({ identity, observation, state: structuredClone(previous), signal }), signal))
    const updated = { ...previous, wakes: previous.wakes + 1 }

    if (decision.kind === 'rest') {
      updated.lastOutcome = 'rest'
      await store.save(updated)
      return { outcome: 'rest', wakes: updated.wakes }
    }

    // Model proposals never authorize themselves. Deny by default.
    const allowed = (await abortable(() => authorize({ identity, action: decision.action, observation,
                                                       state: structuredClone(previous), signal }), signal)) === true
    if (!allowed) {
      updated.lastOutcome = 'denied'
      await store.save(updated)
      return { outcome: 'denied', wakes: updated.wakes }
    }
    if (typeof world.execute !== 'function')
      throw new Error('No trusted action executor configured')
    // Last cancellation point. An in-flight external effect is never abandoned.
    signal?.throwIfAborted()

    // Persist a reservation BEFORE an external side effect. A crash blocks
    // subsequent actions until a trusted operator calls resolvePendingAction.
    // Unless this save is confirmed durable, execute is never called.
    const id = actionId()
    if (typeof id !== 'string' || !id || id.length > 128) throw new TypeError('Invalid action id')
    const pending = { ...updated, lastOutcome: 'pending',
                      pendingAction: { id, status: 'pending', kind: decision.action.kind, at: now() } }
    try {
      await store.save(pending)
    } catch (error) {
      // Visible but unconfirmed: it may block later wakes, so report it. It
      // is never cleared automatically; resolve it as not-executed.
      if (replacedButNotDurable(error)) return { outcome: 'reservation_not_durable', actionId: id }
      throw error
    }

    let receipt, failure
    try {
      receipt = await world.execute({ identity, action: decision.action, actionId: id })
    } catch (error) {
      failure = { reason: 'execution_failed', error: failureDiagnostics(error) }
    }
    if (!failure && classifyActionOutcome(receipt, { requireReceipt: true }) !== 'confirmed') {
      failure = { reason: 'receipt_invalid' }
    }
    if (failure) {
      // Whatever this save leaves visible (reservation or uncertain record) blocks.
      const recorded = await saveRecorded(store, { ...pending, lastOutcome: 'uncertain',
        pendingAction: { ...pending.pendingAction, status: 'uncertain', ...failure } })
      return { outcome: 'uncertain', actionId: id, reason: failure.reason, recorded }
    }

    // Two-phase completion. Phase 1 makes the receipt durable while the action
    // still blocks; only then does phase 2 clear the block. Any visible state
    // that permits a new action therefore follows a DURABLE receipt, however
    // either write fails (including a rename whose directory fsync fails).
    const lastReceipt = { actionId: id, receiptId: receipt.receiptId, kind: decision.action.kind }
    try {
      await store.save({ ...pending, lastOutcome: 'uncertain',
        pendingAction: { ...pending.pendingAction, status: 'uncertain', reason: 'completion_pending',
                         receipt: { receiptId: receipt.receiptId } } })
    } catch {
      // Visible state is the reservation or the receipt record: both block.
      return { outcome: 'uncertain', actionId: id, reason: 'completion_not_persisted',
               recorded: false, receipt: lastReceipt }
    }
    try {
      await store.save({ ...pending, pendingAction: null, lastOutcome: 'acted', lastReceipt })
    } catch {
      // The receipt is durable. If the clear is lost, the next wake
      // finalizes it from that receipt (outcome `recovered`).
      return { outcome: 'acted', actionId: id, wakes: pending.wakes, durable: false }
    }
    return { outcome: 'acted', actionId: id, wakes: pending.wakes }
  })
}

// Judges a trusted verifier's verdict. Anything short of explicit, matching
// evidence leaves the action unresolved; absence of state is never evidence.
function evaluateVerdict(verdict, pending) {
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) return { reason: 'no_verdict' }
  if (verdict.actionId !== pending.id) return { reason: 'action_id_mismatch' }
  if (verdict.status === 'confirmed') {
    if (!isConfirmedActionReceipt(verdict)) return { reason: 'invalid_receipt' }
    if (pending.receipt && pending.receipt.receiptId !== verdict.receiptId) return { reason: 'receipt_conflict' }
    return { resolution: 'confirmed', receiptId: verdict.receiptId }
  }
  if (verdict.status === 'not-executed') {
    if (pending.receipt) return { reason: 'receipt_conflict' }
    if (typeof verdict.evidenceId !== 'string' || !verdict.evidenceId || verdict.evidenceId.length > 200) {
      return { reason: 'missing_evidence' }
    }
    return { resolution: 'not-executed', evidenceId: verdict.evidenceId }
  }
  return { reason: 'unverified' }
}

// Trusted host/operator reconciliation of one pending or uncertain action.
// Never expose this to a model. It does not execute or retry the action:
// the outcome comes only from `verify`, the host's lookup of the exact
// action id in the external system. Every attempt is recorded.
export async function resolvePendingAction({ identity, store, actionId, verify, resolvedBy,
                                             now = () => new Date().toISOString() }) {
  assertAgentIdentity(identity)
  if (!store || typeof store.withLock !== 'function' ||
      typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new TypeError('Missing runtime adapter')
  }
  if (typeof actionId !== 'string' || !actionId || actionId.length > 128) {
    throw new TypeError('An exact action id is required')
  }
  if (typeof verify !== 'function') throw new TypeError('A trusted verification port is required')
  if (typeof resolvedBy !== 'string' || !resolvedBy.trim() || resolvedBy.length > 128) {
    throw new TypeError('An operator identity is required for the audit record')
  }

  return store.withLock(async () => {
    const state = await store.load()
    if (state.agentId !== identity.id) throw new Error('Agent identity mismatch')
    const history = Array.isArray(state.reconciliations) ? state.reconciliations : []
    const pending = state.pendingAction
    if (!pending) {
      const earlier = history.findLast(entry => entry.actionId === actionId && entry.resolution !== 'unresolved')
      if (earlier) return { outcome: 'already-resolved', actionId, resolution: earlier.resolution }
      throw new Error('No pending action to resolve')
    }
    if (pending.id !== actionId) throw new Error('Action id does not match the pending action')

    let verdict, verifyError
    try {
      verdict = await verify({ identity, actionId, pendingAction: structuredClone(pending) })
    } catch (error) {
      verifyError = failureDiagnostics(error)
    }
    const judged = verifyError ? { reason: 'verify_failed' } : evaluateVerdict(verdict, pending)
    const resolution = judged.resolution ?? 'unresolved'
    const entry = {
      actionId, kind: pending.kind ?? null, previousStatus: pending.status,
      ...(pending.reason && { previousReason: pending.reason }),
      resolution,
      ...(judged.reason && { reason: judged.reason }),
      ...(judged.receiptId && { receiptId: judged.receiptId }),
      ...(judged.evidenceId && { evidenceId: judged.evidenceId }),
      ...(verifyError && { error: verifyError }),
      resolvedBy, at: now(),
    }
    const reconciliations = retainAudit([...history, entry])

    if (resolution === 'unresolved') {
      await store.save({ ...state, reconciliations })
      return { outcome: 'unresolved', actionId, reason: judged.reason }
    }
    const resolved = { ...state, pendingAction: null, lastOutcome: 'reconciled', reconciliations }
    if (resolution === 'confirmed') {
      resolved.lastReceipt = { actionId, receiptId: judged.receiptId, kind: pending.kind ?? 'unknown' }
    }
    await store.save(resolved)
    return { outcome: 'resolved', actionId, resolution,
             ...(judged.receiptId && { receiptId: judged.receiptId }) }
  })
}
