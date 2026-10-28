import { randomUUID } from 'node:crypto'
import {
  assertAgentIdentity, assertWakePorts, parseWakeDecision,
  assertBoundedObservation, isConfirmedActionReceipt,
} from './contracts.mjs'
import { classifyActionOutcome } from './action-outcomes.mjs'

const MAX_RECONCILIATIONS = 100

// Bounded, secret-free failure diagnostics: never an exception message.
function failureDiagnostics(error) {
  const text = value => typeof value === 'string' && value ? value.slice(0, 64) : undefined
  return { name: text(error?.name) ?? 'Error', ...(text(error?.code) && { code: text(error.code) }) }
}

async function saveRecorded(store, state) {
  try { await store.save(state); return true } catch { return false }
}

// Cancels waiting on a side-effect-free port; the abandoned call cannot
// influence this wake after rejection.
function abortable(value, signal) {
  if (!signal) return value
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(value).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
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
      return { outcome: 'blocked', reason: 'unresolved_action',
               actionId: previous.pendingAction.id }
    }

    const observation = await abortable(
      world.observe({ identity, state: structuredClone(previous), signal }), signal)
    assertBoundedObservation(observation)
    const decision = parseWakeDecision(await abortable(
      decide({ identity, observation, state: structuredClone(previous), signal }), signal))
    const updated = { ...previous, wakes: previous.wakes + 1 }

    if (decision.kind === 'rest') {
      updated.lastOutcome = 'rest'
      await store.save(updated)
      return { outcome: 'rest', wakes: updated.wakes }
    }

    // Model proposals never authorize themselves. Deny by default.
    const allowed = (await abortable(authorize({ identity, action: decision.action, observation,
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
    // If this save throws, execute is never called.
    const id = actionId()
    if (typeof id !== 'string' || !id || id.length > 128) throw new TypeError('Invalid action id')
    const pending = { ...updated, lastOutcome: 'pending',
                      pendingAction: { id, status: 'pending', kind: decision.action.kind, at: now() } }
    await store.save(pending)

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
      // If even this save fails, the durable reservation still blocks later wakes.
      const recorded = await saveRecorded(store, { ...pending, lastOutcome: 'uncertain',
        pendingAction: { ...pending.pendingAction, status: 'uncertain', ...failure } })
      return { outcome: 'uncertain', actionId: id, reason: failure.reason, recorded }
    }

    const lastReceipt = { actionId: id, receiptId: receipt.receiptId, kind: decision.action.kind }
    try {
      await store.save({ ...pending, pendingAction: null, lastOutcome: 'acted', lastReceipt })
    } catch (error) {
      // The effect happened but completion is not durable. Keep the action
      // blocked, keep the receipt, and hand it to the host for reconciliation.
      const recorded = await saveRecorded(store, { ...pending, lastOutcome: 'uncertain',
        pendingAction: { ...pending.pendingAction, status: 'uncertain', reason: 'receipt_not_persisted',
                         receipt: { receiptId: receipt.receiptId }, error: failureDiagnostics(error) } })
      return { outcome: 'uncertain', actionId: id, reason: 'receipt_not_persisted', recorded, receipt: lastReceipt }
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
    const reconciliations = [...history, entry].slice(-MAX_RECONCILIATIONS)

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
