import { randomUUID } from 'node:crypto'

function assertIdentity(identity) {
  if (!identity || typeof identity.id !== 'string' || !identity.id.trim())
    throw new TypeError('Identity must contain a non-empty id')
}

function parseDecision(decision) {
  if (decision?.kind === 'rest') return { kind: 'rest' }
  if (decision?.kind !== 'action' || !decision.action ||
      typeof decision.action.kind !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(decision.action.kind) ||
      !decision.action.payload || typeof decision.action.payload !== 'object' ||
      Array.isArray(decision.action.payload)) {
    throw new TypeError('Invalid decision; expected rest or a bounded action proposal')
  }
  if (Buffer.byteLength(JSON.stringify(decision.action), 'utf8') > 4096)
    throw new Error('Action proposal exceeds the 4 KiB limit')
  return { kind: 'action', action: decision.action }
}

export async function runWake({ identity, store, world, decide, authorize = async () => false,
                                now = () => new Date().toISOString(), actionId = randomUUID }) {
  assertIdentity(identity)
  if (!store || typeof store.withLock !== 'function' ||
      typeof store.load !== 'function' || typeof store.save !== 'function' ||
      typeof world?.observe !== 'function' || typeof decide !== 'function' ||
      typeof authorize !== 'function') throw new TypeError('Missing runtime adapter')

  return store.withLock(async () => {
    const previous = await store.load()
    if (previous.agentId !== identity.id) throw new Error('Agent identity mismatch')
    if (previous.pendingAction) {
      return { outcome: 'blocked', reason: 'unresolved_action',
               actionId: previous.pendingAction.id }
    }

    const observation = await world.observe({ identity, state: structuredClone(previous) })
    if (Buffer.byteLength(JSON.stringify(observation), 'utf8') > 16384)
      throw new Error('Observation exceeds the 16 KiB limit')
    const decision = parseDecision(await decide({ identity, observation,
                                                   state: structuredClone(previous) }))
    const updated = { ...previous, wakes: previous.wakes + 1 }

    if (decision.kind === 'rest') {
      updated.lastOutcome = 'rest'
      await store.save(updated)
      return { outcome: 'rest', wakes: updated.wakes }
    }

    // Model proposals never authorize themselves. Deny by default.
    const allowed = (await authorize({ identity, action: decision.action,
                                       observation, state: structuredClone(previous) })) === true
    if (!allowed) {
      updated.lastOutcome = 'denied'
      await store.save(updated)
      return { outcome: 'denied', wakes: updated.wakes }
    }
    if (typeof world.execute !== 'function')
      throw new Error('No trusted action executor configured')

    // Persist a reservation BEFORE an external side effect. A crash blocks
    // subsequent actions until a human reconciles the unknown outcome.
    const id = actionId()
    if (typeof id !== 'string' || !id) throw new TypeError('Invalid action id')
    const pending = { ...updated, lastOutcome: 'pending',
                      pendingAction: { id, status: 'pending', kind: decision.action.kind, at: now() } }
    await store.save(pending)

    let receipt
    try {
      receipt = await world.execute({ identity, action: decision.action, actionId: id })
      if (receipt?.status !== 'confirmed' ||
          typeof receipt.receiptId !== 'string' || !receipt.receiptId ||
          receipt.receiptId.length > 200) {
        throw new Error('No confirmed execution receipt')
      }
    } catch {
      await store.save({ ...pending, lastOutcome: 'uncertain',
                         pendingAction: { ...pending.pendingAction, status: 'uncertain' } })
      return { outcome: 'uncertain', actionId: id }
    }
    const completed = { ...pending, pendingAction: null, lastOutcome: 'acted',
                        lastReceipt: { actionId: id, receiptId: receipt.receiptId,
                                       kind: decision.action.kind } }
    await store.save(completed)
    return { outcome: 'acted', actionId: id, wakes: completed.wakes }
  })
}
