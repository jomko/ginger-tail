import { randomUUID } from 'node:crypto'
import {
  assertAgentIdentity, assertWakePorts, parseWakeDecision,
  assertBoundedObservation,
} from './contracts.mjs'
import { classifyActionOutcome } from './action-outcomes.mjs'

export async function runWake({ identity, store, world, decide, authorize = async () => false,
                                now = () => new Date().toISOString(), actionId = randomUUID }) {
  assertAgentIdentity(identity)
  assertWakePorts({ store, world, decide, authorize })

  return store.withLock(async () => {
    const previous = await store.load()
    if (previous.agentId !== identity.id) throw new Error('Agent identity mismatch')
    if (previous.pendingAction) {
      return { outcome: 'blocked', reason: 'unresolved_action',
               actionId: previous.pendingAction.id }
    }

    const observation = await world.observe({ identity, state: structuredClone(previous) })
    assertBoundedObservation(observation)
    const decision = parseWakeDecision(await decide({ identity, observation,
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
      if (classifyActionOutcome(receipt, { requireReceipt: true }) !== 'confirmed') {
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
