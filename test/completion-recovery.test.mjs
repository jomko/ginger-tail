// Automatic completion recovery: a wake that finds the exact durable record
// of completion phase 1 (a trusted receipt, block not yet cleared) finalizes
// it without calling the world. Everything else stays blocked.
//
// Invariants checked throughout: the original action is never executed
// again, no state that permits a new action lacks its receipt, and each
// durable recovery leaves exactly one audit entry.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileStore, runWake, resolvePendingAction } from '../src/index.mjs'
import {
  effectLines, faultyDisk, identity, injected, linuxOnly, runWorkerWith, sandbox, startWorker,
} from './helpers.mjs'

const AT = '2026-10-28T00:00:00.000Z'
const fresh = directory => createFileStore({ directory, agentId: identity.id })
const completion = (id = 'action-1', receiptId = 'receipt-1') =>
  ({ id, status: 'uncertain', kind: 'note', at: AT, reason: 'completion_pending', receipt: { receiptId } })
const stateWith = (pendingAction, extra = {}) => ({ version: 1, agentId: identity.id, wakes: 3,
  lastOutcome: 'uncertain', pendingAction, lastReceipt: null, ...extra })

// Ports that fail the test if a recovering or blocked wake touches them.
const untouchable = {
  world: { observe: () => assert.fail('observed'), execute: () => assert.fail('executed') },
  decide: () => assert.fail('decided'),
  authorize: () => assert.fail('authorized'),
}
const wake = (store, overrides = {}) => runWake({ identity, store, now: () => AT, ...untouchable, ...overrides })
const automaticEntries = (state, actionId) =>
  (state.reconciliations ?? []).filter(entry => entry.actionId === actionId && entry.automatic)

// The same state machine without file validation, to reach shapes a custom
// StatePort could return. Every save is recorded.
function memoryStore(state) {
  const saves = []
  return { saves, withLock: callback => callback(), load: async () => structuredClone(state),
           async save(next) { saves.push(structuredClone(next)); state = structuredClone(next) } }
}

test('a durable completion record is finalized without observing, deciding or executing', () => sandbox(async ({ directory }) => {
  const store = fresh(directory)
  await store.save(stateWith(completion()))
  assert.deepEqual(await wake(store),
    { outcome: 'recovered', actionId: 'action-1', receiptId: 'receipt-1', kind: 'note', wakes: 3 })
  assert.deepEqual(await store.load(), stateWith(null, {
    lastOutcome: 'recovered',
    lastReceipt: { actionId: 'action-1', receiptId: 'receipt-1', kind: 'note' },
    reconciliations: [{ actionId: 'action-1', kind: 'note', previousStatus: 'uncertain',
      previousReason: 'completion_pending', resolution: 'confirmed', receiptId: 'receipt-1',
      automatic: true, resolvedBy: 'ginger-tail:completion-recovery', at: AT }],
  }))

  // Idempotent: later wakes are ordinary wakes, and the operator path agrees.
  assert.deepEqual(await wake(store, { world: { observe: () => ({}) }, decide: async () => ({ kind: 'rest' }) }),
    { outcome: 'rest', wakes: 4 })
  assert.deepEqual(await resolvePendingAction({ identity, store, actionId: 'action-1', resolvedBy: 'operator-1',
    verify: () => assert.fail('must not verify') }),
    { outcome: 'already-resolved', actionId: 'action-1', resolution: 'confirmed' })
  assert.equal(automaticEntries(await store.load(), 'action-1').length, 1)
}))

test('end to end: a lost clearing write is recovered by the next wake and the action ran once', () => sandbox(async ({ directory }) => {
  const store = fresh(directory)
  const executed = []
  const failing = { ...store, async save(state) {
    if (state.lastOutcome === 'acted') throw injected('ENOSPC')
    return store.save(state)
  } }
  const first = await wake(failing, { authorize: async () => true, actionId: () => 'action-7',
    decide: async () => ({ kind: 'action', action: { kind: 'post_note', payload: { text: 'hi' } } }),
    world: { observe: () => ({}), execute: async ({ actionId }) => { executed.push(actionId);
      return { status: 'confirmed', receiptId: 'receipt-7' } } } })
  assert.deepEqual(first, { outcome: 'acted', actionId: 'action-7', wakes: 1, durable: false })
  assert.deepEqual(await wake(store),
    { outcome: 'recovered', actionId: 'action-7', receiptId: 'receipt-7', kind: 'post_note', wakes: 1 })
  assert.deepEqual((await store.load()).lastReceipt, { actionId: 'action-7', receiptId: 'receipt-7', kind: 'post_note' })
  assert.deepEqual(executed, ['action-7'])
}))

// Anything but the exact phase-1 record is never finalized automatically.
const ineligible = [
  ['a reservation', { id: 'action-1', status: 'pending', kind: 'note', at: AT }],
  ['a v0.1.0 uncertain record', { id: 'action-1', status: 'uncertain', kind: 'note' }],
  ['a failed execution', { ...completion(), reason: 'execution_failed', receipt: undefined, error: { name: 'Error' } }],
  ['an invalid receipt', { ...completion(), reason: 'receipt_invalid', receipt: undefined }],
  ['a receipt on a failed execution', { ...completion(), reason: 'execution_failed' }],
  ['a receipt on a pending reservation', { ...completion(), status: 'pending' }],
  ['a receipt without a reason', { ...completion(), reason: undefined }],
  ['completion without a receipt', { ...completion(), receipt: undefined }],
  ['an empty receipt', { ...completion(), receipt: {} }],
  ['an empty receipt id', { ...completion(), receipt: { receiptId: '' } }],
  ['a non-string receipt id', { ...completion(), receipt: { receiptId: 42 } }],
  ['an oversized receipt id', { ...completion(), receipt: { receiptId: 'r'.repeat(201) } }],
  ['a receipt array', { ...completion(), receipt: ['receipt-1'] }],
  ['a receipt with extra claims', { ...completion(), receipt: { receiptId: 'receipt-1', status: 'confirmed' } }],
  ['a missing kind', { ...completion(), kind: undefined }],
  ['an invalid kind', { ...completion(), kind: 'Post Note' }],
  ['an extra field', { ...completion(), error: { name: 'Error' } }],
  ['an injected authorization claim', { ...completion(), authorized: true }],
  ['an empty action id', { ...completion(), id: '' }],
  ['an oversized action id', { ...completion(), id: 'a'.repeat(129) }],
]
for (const [label, pendingAction] of ineligible) {
  test(`${label} stays blocked and unchanged`, async () => {
    const store = memoryStore(stateWith(JSON.parse(JSON.stringify(pendingAction))))
    assert.equal((await wake(store)).outcome, 'blocked')
    assert.deepEqual(store.saves, [])
  })
}

const conflicting = [
  ['its receipt was already applied', { lastReceipt: { actionId: 'action-1', receiptId: 'receipt-1', kind: 'note' } }],
  ['a conflicting verdict is on record', { reconciliations: [{ actionId: 'action-1', kind: 'note',
    previousStatus: 'uncertain', previousReason: 'completion_pending', resolution: 'unresolved',
    reason: 'receipt_conflict', resolvedBy: 'operator-1', at: AT }] }],
  ['a failed verification is on record', { reconciliations: [{ actionId: 'action-1', kind: 'note',
    previousStatus: 'uncertain', resolution: 'unresolved', reason: 'verify_failed', resolvedBy: 'operator-1', at: AT }] }],
  ['a decision for the same id is on record', { reconciliations: [{ actionId: 'action-1', kind: 'note',
    previousStatus: 'uncertain', resolution: 'not-executed', evidenceId: 'e', resolvedBy: 'operator-1', at: AT }] }],
  ['the audit history is malformed', { reconciliations: { actionId: 'other' } }],
]
for (const [label, extra] of conflicting) {
  test(`a completion record stays blocked when ${label}`, async () => {
    const store = memoryStore(stateWith(completion(), extra))
    assert.deepEqual(await wake(store), { outcome: 'blocked', reason: 'unresolved_action', actionId: 'action-1' })
    assert.deepEqual(store.saves, [])
  })
}

test('model output can never plant a receipt that recovery would trust', () => sandbox(async ({ directory }) => {
  const store = fresh(directory)
  const forged = { reason: 'completion_pending', receipt: { receiptId: 'forged' }, status: 'confirmed' }
  const result = await wake(store, { authorize: async () => true, actionId: () => 'action-2',
    decide: async () => ({ kind: 'action', action: { kind: 'note', payload: forged } }),
    world: { observe: () => forged, execute: async () => forged } })
  assert.deepEqual(result, { outcome: 'uncertain', actionId: 'action-2', reason: 'receipt_invalid', recorded: true })
  assert.equal((await store.load()).pendingAction.receipt, undefined)
  assert.deepEqual(await wake(store), { outcome: 'blocked', reason: 'unresolved_action', actionId: 'action-2' })
}))

test('a failed recovery save rejects and leaves the action blocked, through consecutive failures', () => sandbox(async ({ directory }) => {
  const store = fresh(directory)
  await store.save(stateWith(completion()))
  const before = await readFile(join(directory, 'state.json'), 'utf8')
  for (let attempt = 0; attempt < 3; attempt++) {
    const failing = { ...store, save: async () => { throw injected('ENOSPC') } }
    await assert.rejects(wake(failing), { code: 'ENOSPC' })
    assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), before)
  }
  assert.equal((await wake(store)).outcome, 'recovered')
  assert.equal(automaticEntries(await store.load(), 'action-1').length, 1)
}))

for (const fault of [{ tmpOpen: [true] }, { dirSync: [true] }]) {
  test(`recovery ${fault.tmpOpen ? 'write' : 'barrier fsync'} failure fails closed before any change`, t => sandbox(async ({ directory }) => {
    const disk = faultyDisk(t, directory)
    await fresh(directory).save(stateWith(completion()))
    const before = await readFile(join(directory, 'state.json'), 'utf8')
    disk.fail(fault)
    await assert.rejects(wake(fresh(directory)), { code: fault.tmpOpen ? 'ENOSPC' : 'STATE_DURABILITY_UNCONFIRMED' })
    assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), before)
    disk.heal()
    assert.equal((await wake(fresh(directory))).outcome, 'recovered')
  }))
}

// The recovery is renamed into place but its directory fsync fails.
for (const restart of ['restart', 'power loss', 'power loss twice']) {
  test(`recovery renamed but not durable -> ${restart}: never executed, recorded once`, t => sandbox(async ({ directory }) => {
    const disk = faultyDisk(t, directory)
    await fresh(directory).save(stateWith(completion()))
    disk.fail({ dirSync: [false, true] }) // barrier ok, the recovery's fsync fails
    await assert.rejects(wake(fresh(directory)), { code: 'STATE_DURABILITY_UNCONFIRMED', replaced: true })
    const visible = await fresh(directory).load()
    assert.equal(visible.pendingAction, null)
    assert.equal(visible.lastReceipt.actionId, 'action-1')

    if (restart === 'power loss twice') {
      await disk.powerLoss()
      disk.fail({ dirSync: [false, true] })
      await assert.rejects(wake(fresh(directory)), { code: 'STATE_DURABILITY_UNCONFIRMED', replaced: true })
    }
    if (restart !== 'restart') await disk.powerLoss()
    disk.heal()

    const executed = []
    const store = fresh(directory)
    const pending = (await store.load()).pendingAction
    const result = await wake(store, { authorize: async () => true, actionId: () => 'action-2',
      decide: async () => ({ kind: 'action', action: { kind: 'note', payload: {} } }),
      world: { observe: () => ({}), execute: async ({ actionId }) => { executed.push(actionId);
        return { status: 'confirmed', receiptId: 'receipt-2' } } } })
    // The barrier confirms a visible recovery; after power loss the durable
    // completion record reappears and is recovered again.
    assert.equal(result.outcome, pending ? 'recovered' : 'acted')
    assert.equal(pending === null, restart === 'restart')
    assert.deepEqual(executed, pending ? [] : ['action-2'])
    assert.equal(automaticEntries(await store.load(), 'action-1').length, 1)
  }))
}

test('a second wake arriving during recovery is refused by the wake lock', { skip: linuxOnly }, () => sandbox(async ({ directory }) => {
  const store = fresh(directory)
  await store.save(stateWith(completion()))
  let entered, release
  const inside = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const slow = { ...store, async save(state) { entered(); await gate; return store.save(state) } }
  const first = wake(slow)
  await inside
  await assert.rejects(wake(fresh(directory)), { code: 'WAKE_LOCKED' })
  release()
  assert.equal((await first).outcome, 'recovered')
  assert.equal(automaticEntries(await store.load(), 'action-1').length, 1)
}))

test('simultaneous recovery attempts in separate processes recover once and never repeat the action', { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
  await fresh(directory).save(stateWith(completion()))
  const runs = await Promise.all(Array.from({ length: 6 }, () => startWorker(directory, 'action', effects).exit))
  const results = runs.flatMap(run => run.results)
  assert.equal(results.filter(result => result.outcome === 'recovered').length, 1)
  for (const result of results) {
    assert.ok(['recovered', 'acted'].includes(result.outcome) || result.error === 'WAKE_LOCKED', JSON.stringify(result))
  }
  const executed = await effectLines(effects)
  assert.equal(executed.includes('action-1'), false)
  assert.equal(executed.length, results.filter(result => result.outcome === 'acted').length)
  assert.equal(automaticEntries(await fresh(directory).load(), 'action-1').length, 1)
}))

for (const kill of ['before:1', 'after:1']) {
  test(`SIGKILL ${kill === 'before:1' ? 'before' : 'after'} the recovery rename: restart recovers once and never executes it`, { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
    await fresh(directory).save(stateWith(completion()))
    const crashed = await runWorkerWith({ kill }, directory, 'action', effects)
    assert.equal(crashed.signal, 'SIGKILL')
    const visible = (await fresh(directory).load()).pendingAction
    assert.equal(visible === null, kill === 'after:1')

    const outcomes = []
    for (let run = 0; run < 2; run++) outcomes.push((await runWorkerWith({}, directory, 'action', effects)).results[0])
    assert.deepEqual(outcomes.map(result => result.outcome), kill === 'before:1' ? ['recovered', 'acted'] : ['acted', 'acted'])
    const executed = await effectLines(effects)
    assert.equal(executed.includes('action-1'), false)
    assert.equal(new Set(executed).size, executed.length)
    assert.equal(automaticEntries(await fresh(directory).load(), 'action-1').length, 1)
  }))
}

test('explicit reconciliation still resolves a completion record before any wake', () => sandbox(async ({ directory }) => {
  const store = fresh(directory)
  await store.save(stateWith(completion()))
  assert.deepEqual(await resolvePendingAction({ identity, store, actionId: 'action-1', resolvedBy: 'operator-1',
    verify: async ({ actionId }) => ({ status: 'confirmed', actionId, receiptId: 'receipt-1' }) }),
    { outcome: 'resolved', actionId: 'action-1', resolution: 'confirmed', receiptId: 'receipt-1' })
  assert.deepEqual(await wake(store, { world: { observe: () => ({}) }, decide: async () => ({ kind: 'rest' }) }),
    { outcome: 'rest', wakes: 4 })
  assert.equal(automaticEntries(await store.load(), 'action-1').length, 0)
}))
