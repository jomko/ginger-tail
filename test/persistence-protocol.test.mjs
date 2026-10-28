// Adversarial tests of the whole reservation -> execution -> receipt ->
// reconciliation protocol under filesystem faults, power loss, restarts and
// SIGKILL at each persistence boundary.
//
// Primary invariant: an action whose outcome is unresolved never becomes
// executable again, and no later action is permitted by a state that lacks
// the earlier action's confirmed receipt, however persistence fails.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileStore, runWake, resolvePendingAction } from '../src/index.mjs'
import { effectLines, faultyDisk, identity, linuxOnly, runWorker, runWorkerWith, sandbox } from './helpers.mjs'

const note = { kind: 'action', action: { kind: 'note', payload: {} } }
const fresh = directory => createFileStore({ directory, agentId: identity.id })

// The synthetic external system: actionId -> receiptId. `execute` records the
// effect first, so a thrown error after it models "happened, but unconfirmed".
function externalSystem() {
  const effects = []
  return {
    effects,
    execute: ({ throwAfter = false, onEffect = () => {} } = {}) => async ({ actionId }) => {
      effects.push(actionId)
      onEffect()
      if (throwAfter) throw new Error('connection reset after send')
      return { status: 'confirmed', receiptId: 'receipt-' + actionId }
    },
    verify: async ({ actionId }) => effects.includes(actionId)
      ? { status: 'confirmed', actionId, receiptId: 'receipt-' + actionId }
      : { status: 'not-executed', actionId, evidenceId: 'external-lookup' },
  }
}

async function wake(store, execute, observed = { count: 0 }) {
  return runWake({ identity, store, authorize: async () => true, decide: async () => note,
    world: { observe: () => { observed.count++; return {} }, execute } })
}

// No state that permits a new action may lack the receipt of an executed one.
async function assertNoLostAction(store, system, actionId) {
  const state = await store.load()
  const executions = system.effects.filter(id => id === actionId).length
  assert.ok(executions <= 1, 'action executed twice')
  if (executions === 1 && !state.pendingAction) {
    assert.equal(state.lastReceipt?.actionId, actionId, 'executed action vanished from state')
  }
  return state
}

// Drives the agent back to health: a durable completion record is finalized
// by the next wake itself, without executing; any other unresolved action
// stays blocked until an operator reconciles it from external evidence.
async function recoverAndAct(store, system) {
  for (let round = 0; round < 3; round++) {
    const observed = { count: 0 }
    const executed = system.effects.length
    const pending = (await store.load()).pendingAction
    const result = await wake(store, system.execute(), observed)
    if (result.outcome === 'acted') {
      assert.equal(pending, null, 'acted while an earlier action was unresolved')
      return result
    }
    assert.equal(observed.count, 0, 'a blocked or recovering wake observed the world')
    assert.equal(system.effects.length, executed, 'a blocked or recovering wake executed')
    if (pending.reason === 'completion_pending') {
      assert.deepEqual(result, { outcome: 'recovered', actionId: pending.id, receiptId: pending.receipt.receiptId,
                                 kind: 'note', wakes: result.wakes })
      assert.ok(system.effects.includes(result.actionId), 'recovered an action that never ran')
      const audit = (await store.load()).reconciliations.filter(entry => entry.actionId === pending.id)
      assert.equal(audit.length, 1)
      assert.equal(audit[0].automatic, true)
      continue
    }
    assert.equal(result.outcome, 'blocked')
    const resolved = await resolvePendingAction({ identity, store, actionId: result.actionId,
      verify: system.verify, resolvedBy: 'operator-test' })
    assert.equal(resolved.outcome, 'resolved')
    assert.equal(resolved.resolution, system.effects.includes(result.actionId) ? 'confirmed' : 'not-executed')
  }
  assert.fail('agent did not recover')
}

// Each scenario: faults queued before the wake and/or inside execute (that is,
// after the reservation is durable). Faults per call: dirSync covers the lock
// barrier and every save's directory fsync; tmpOpen covers every save's write.
const scenarios = [
  { name: 'barrier fsync fails before the wake', before: { dirSync: [true] },
    expect: { rejects: 'STATE_DURABILITY_UNCONFIRMED', executed: false } },
  { name: 'reservation write fails before rename', before: { tmpOpen: [true] },
    expect: { rejects: 'ENOSPC', executed: false } },
  { name: 'reservation renamed but its fsync fails', before: { dirSync: [false, true] },
    expect: { outcome: 'reservation_not_durable', executed: false } },
  { name: 'execution throws after the effect and the uncertain record fsync fails', throwAfter: true,
    during: { dirSync: [true] }, expect: { outcome: 'uncertain', reason: 'execution_failed', blocked: true } },
  { name: 'receipt record write fails before rename', during: { tmpOpen: [true] },
    expect: { outcome: 'uncertain', reason: 'completion_not_persisted', blocked: true } },
  { name: 'receipt record renamed but its fsync fails', during: { dirSync: [true] },
    expect: { outcome: 'uncertain', reason: 'completion_not_persisted', blocked: true } },
  { name: 'every later fsync and write fails (consecutive failures)', during: { dirSync: Array(9).fill(true), tmpOpen: Array(9).fill(true) },
    expect: { outcome: 'uncertain', reason: 'completion_not_persisted', blocked: true } },
  // The reported critical sequence, at the write that clears the block:
  // rename succeeds, directory fsync fails, any later write fails before rename.
  { name: 'clearing write renamed, fsync fails, further writes fail', during: { dirSync: [false, true], tmpOpen: [false, false, true] },
    expect: { outcome: 'acted', durable: false } },
  { name: 'clearing write fails before rename', during: { tmpOpen: [false, true] },
    expect: { outcome: 'acted', durable: false } },
]

for (const scenario of scenarios) {
  for (const restart of ['restart', 'power loss', 'restart with the disk still failing']) {
    test(`${scenario.name} -> ${restart}`, t => sandbox(async ({ directory }) => {
      const disk = faultyDisk(t, directory)
      await fresh(directory).save({ version: 1, agentId: identity.id, wakes: 0, lastOutcome: null,
                                    pendingAction: null, lastReceipt: null })
      const system = externalSystem()
      const observed = { count: 0 }
      disk.fail(scenario.before)
      const first = wake(fresh(directory), system.execute({ throwAfter: scenario.throwAfter,
        onEffect: () => scenario.during && disk.fail(scenario.during) }), observed)
      const { expect } = scenario

      let actionId
      if (expect.rejects) {
        await assert.rejects(first, { code: expect.rejects })
      } else {
        const result = await first
        assert.equal(result.outcome, expect.outcome)
        if (expect.reason) assert.equal(result.reason, expect.reason)
        if ('durable' in expect) assert.equal(result.durable, expect.durable)
        if (result.receipt) assert.equal(result.receipt.receiptId, 'receipt-' + result.actionId)
        actionId = result.actionId
      }
      if (expect.executed === false) assert.deepEqual(system.effects, [])
      else assert.deepEqual(system.effects, [actionId])
      if (expect.rejects === 'STATE_DURABILITY_UNCONFIRMED') assert.equal(observed.count, 0)

      if (restart === 'power loss') await disk.powerLoss()
      if (restart === 'restart with the disk still failing') {
        disk.failForever()
        const blind = { count: 0 }
        await assert.rejects(wake(fresh(directory), system.execute(), blind), { code: 'STATE_DURABILITY_UNCONFIRMED' })
        assert.equal(blind.count, 0)
        assert.equal(system.effects.length, expect.executed === false ? 0 : 1)
      }
      disk.heal()

      const store = fresh(directory)
      const state = actionId ? await assertNoLostAction(store, system, actionId) : await store.load()
      // An uncertain report is a promise: blocked until reconciliation,
      // in every restart mode, including after power loss.
      if (expect.blocked) assert.equal(state.pendingAction?.id, actionId)

      const next = await recoverAndAct(store, system)
      assert.notEqual(next.actionId, actionId)
      assert.equal(new Set(system.effects).size, system.effects.length, 'an action id executed twice')
    }))
  }
}

// Real processes killed at each persistence boundary of an action wake.
const boundaries = [
  ['before:1', 'before the reservation rename'],
  ['after:1', 'after the reservation rename, before its fsync'],
  ['before:2', 'after execution, before the receipt record rename'],
  ['after:2', 'after the receipt record rename, before its fsync'],
  ['before:3', 'after a durable receipt, before the clearing rename'],
  ['after:3', 'after the clearing rename, before its fsync'],
]
for (const [kill, label] of boundaries) {
  test(`SIGKILL ${label}: restart never repeats or loses the action`, { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
    const crashed = await runWorkerWith({ kill }, directory, 'action', effects)
    assert.equal(crashed.signal, 'SIGKILL')
    const store = fresh(directory)
    const executed = await effectLines(effects)
    const state = await store.load()
    assert.ok(executed.length <= 1)
    if (executed.length) {
      assert.ok(state.pendingAction?.id === executed[0] || state.lastReceipt?.actionId === executed[0])
    }

    // Restart in a new process. A durable receipt record is finalized by
    // that wake without executing; anything else is reconciled from the log.
    let next = (await runWorker(directory, 'action', effects)).results[0]
    if (state.pendingAction?.reason === 'completion_pending') {
      assert.deepEqual(next, { outcome: 'recovered', actionId: state.pendingAction.id,
        receiptId: 'receipt-' + state.pendingAction.id, kind: 'note', wakes: 1 })
      assert.deepEqual(await effectLines(effects), executed)
      next = (await runWorker(directory, 'action', effects)).results[0]
    } else if (next.outcome === 'blocked') {
      assert.equal(state.pendingAction.id, next.actionId)
      const found = (await effectLines(effects)).includes(next.actionId)
      const resolved = await resolvePendingAction({ identity, store, actionId: next.actionId, resolvedBy: 'operator-test',
        verify: async ({ actionId }) => found
          ? { status: 'confirmed', actionId, receiptId: 'receipt-' + actionId }
          : { status: 'not-executed', actionId, evidenceId: 'effects-log-scan' } })
      assert.equal(resolved.outcome, 'resolved')
      next = (await runWorker(directory, 'action', effects)).results[0]
    }
    assert.equal(next.outcome, 'acted')
    const all = await effectLines(effects)
    assert.equal(new Set(all).size, all.length, 'an action id executed twice')
    assert.equal(all.at(-1), next.actionId)
  }))
}

test('a restarted process confirms a visible receipt record at its barrier, then recovers it without executing', { skip: linuxOnly }, t => sandbox(async ({ directory, effects }) => {
  const disk = faultyDisk(t, directory)
  const system = externalSystem()
  const result = await wake(fresh(directory), system.execute({ onEffect: () => disk.fail({ dirSync: [true] }) }))
  assert.equal(result.reason, 'completion_not_persisted')
  const pending = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).pendingAction
  assert.deepEqual(pending.receipt, { receiptId: 'receipt-' + result.actionId })
  t.mock.restoreAll()
  const restarted = (await runWorker(directory, 'action', effects)).results[0]
  assert.deepEqual(restarted, { outcome: 'recovered', actionId: result.actionId,
                                receiptId: 'receipt-' + result.actionId, kind: 'note', wakes: 1 })
  assert.deepEqual(await effectLines(effects), [])
  assert.deepEqual(system.effects, [result.actionId])
}))

test('reconciliation whose own save is not durable is confirmed by the next barrier, not repeated blindly', t => sandbox(async ({ directory }) => {
  const disk = faultyDisk(t, directory)
  const system = externalSystem()
  const store = fresh(directory)
  const first = await wake(store, system.execute({ throwAfter: true }))
  disk.fail({ dirSync: [false, true] }) // barrier ok, the resolution's fsync fails
  await assert.rejects(resolvePendingAction({ identity, store, actionId: first.actionId,
    verify: system.verify, resolvedBy: 'operator-test' }), { code: 'STATE_DURABILITY_UNCONFIRMED', replaced: true })
  let verified = 0
  const again = await resolvePendingAction({ identity, store, actionId: first.actionId, resolvedBy: 'operator-test',
    verify: async input => { verified++; return system.verify(input) } })
  assert.equal(again.outcome, 'already-resolved')
  assert.equal(verified, 0)

  // After power loss the resolution may be gone: it is simply blocked again.
  await disk.powerLoss()
  const after = await wake(store, system.execute())
  assert.ok(after.outcome === 'acted' || after.outcome === 'blocked')
  assert.deepEqual(system.effects.filter(id => id === first.actionId), [first.actionId])
}))
