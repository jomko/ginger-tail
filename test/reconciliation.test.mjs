import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileStore, runWake, resolvePendingAction } from '../src/index.mjs'
import { effectLines, identity, linuxOnly, runWorker, sandbox } from './helpers.mjs'

const note = { kind: 'action', action: { kind: 'note', payload: {} } }

// The trusted host's lookup: the synthetic effects log is the "external system".
const verifyAgainst = effects => async ({ actionId }) => (await effectLines(effects)).includes(actionId)
  ? { status: 'confirmed', actionId, receiptId: 'receipt-' + actionId }
  : { status: 'not-executed', actionId, evidenceId: 'effects-log-scan' }

function resolve(store, actionId, verify, overrides = {}) {
  return resolvePendingAction({ identity, store, actionId, verify, resolvedBy: 'operator-1',
    now: () => '2026-10-28T00:00:00.000Z', ...overrides })
}

async function blockedWithoutObserving(store) {
  const result = await runWake({ identity, store, decide: async () => ({ kind: 'rest' }),
    world: { observe: () => assert.fail('a blocked wake must not observe') } })
  assert.equal(result.outcome, 'blocked')
  return result.actionId
}

test('crash before execution: blocked, reconciled as not-executed, later action runs exactly once', { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
  const crashed = await runWorker(directory, 'action', effects, 'crash-before-execute')
  assert.equal(crashed.signal, 'SIGKILL')
  const store = createFileStore({ directory, agentId: identity.id })
  const pending = (await store.load()).pendingAction
  assert.equal(pending.status, 'pending') // never inferred to be done or undone
  assert.equal(await blockedWithoutObserving(store), pending.id)

  assert.deepEqual(await resolve(store, pending.id, verifyAgainst(effects)),
    { outcome: 'resolved', actionId: pending.id, resolution: 'not-executed' })
  const next = await runWorker(directory, 'action', effects)
  assert.equal(next.results[0].outcome, 'acted')
  assert.deepEqual(await effectLines(effects), [next.results[0].actionId])
}))

test('crash after execution: reconciled as confirmed with no duplicate effect', { skip: linuxOnly }, () => sandbox(async ({ directory, effects }) => {
  const crashed = await runWorker(directory, 'action', effects, 'crash-after-execute')
  assert.equal(crashed.signal, 'SIGKILL')
  const store = createFileStore({ directory, agentId: identity.id })
  const { id } = (await store.load()).pendingAction
  assert.equal(await blockedWithoutObserving(store), id)

  const result = await resolve(store, id, verifyAgainst(effects))
  assert.deepEqual(result, { outcome: 'resolved', actionId: id, resolution: 'confirmed', receiptId: 'receipt-' + id })
  const state = await store.load()
  assert.deepEqual(state.lastReceipt, { actionId: id, receiptId: 'receipt-' + id, kind: 'note' })
  assert.equal(state.pendingAction, null)
  assert.deepEqual(await effectLines(effects), [id])
}))

// A store whose save fails for chosen states, standing in for a full or failing disk.
function failingSaves(store, shouldFail) {
  return { ...store, async save(state) {
    if (shouldFail(state)) throw Object.assign(new Error('disk is full: /secret/path'), { code: 'ENOSPC' })
    return store.save(state)
  } }
}

test('persistence failure after execution keeps the receipt and an uncertain outcome', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  let executions = 0
  const execute = async () => { executions++; return { status: 'confirmed', receiptId: 'receipt-9' } }
  const result = await runWake({ identity, store: failingSaves(store, state => state.lastOutcome === 'acted'),
    authorize: async () => true, actionId: () => 'action-9', decide: async () => note,
    world: { observe: () => ({}), execute } })
  assert.deepEqual(result, { outcome: 'uncertain', actionId: 'action-9', reason: 'receipt_not_persisted',
    recorded: true, receipt: { actionId: 'action-9', receiptId: 'receipt-9', kind: 'note' } })
  const pending = (await store.load()).pendingAction
  assert.deepEqual(pending.receipt, { receiptId: 'receipt-9' })
  assert.deepEqual(pending.error, { name: 'Error', code: 'ENOSPC' })
  assert.equal((await readFile(join(directory, 'state.json'), 'utf8')).includes('secret'), false)
  await blockedWithoutObserving(store)

  // A verifier contradicting the captured receipt cannot clear the action.
  assert.equal((await resolve(store, 'action-9', async () =>
    ({ status: 'not-executed', actionId: 'action-9', evidenceId: 'x' }))).reason, 'receipt_conflict')
  assert.equal((await resolve(store, 'action-9', async () =>
    ({ status: 'confirmed', actionId: 'action-9', receiptId: 'other' }))).reason, 'receipt_conflict')
  assert.equal((await resolve(store, 'action-9', async () =>
    ({ status: 'confirmed', actionId: 'action-9', receiptId: 'receipt-9' }))).resolution, 'confirmed')
  assert.equal(executions, 1)
}))

test('when no uncertain record can be written, the reservation still blocks and the receipt is returned', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  const result = await runWake({ identity, store: failingSaves(store, state => state.lastOutcome !== 'pending'),
    authorize: async () => true, actionId: () => 'action-10', decide: async () => note,
    world: { observe: () => ({}), execute: async () => ({ status: 'confirmed', receiptId: 'receipt-10' }) } })
  assert.equal(result.recorded, false)
  assert.equal(result.receipt.receiptId, 'receipt-10')
  assert.equal((await store.load()).pendingAction.status, 'pending')
  await blockedWithoutObserving(store)
}))

test('missing receipt and unverifiable verdicts never resolve an action', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  const result = await runWake({ identity, store, authorize: async () => true, actionId: () => 'action-11',
    decide: async () => note, world: { observe: () => ({}), execute: async () => ({ status: 'confirmed' }) } })
  assert.deepEqual(result, { outcome: 'uncertain', actionId: 'action-11', reason: 'receipt_invalid', recorded: true })

  const verdicts = [
    [undefined, 'no_verdict'],
    [{ status: 'confirmed', actionId: 'action-11' }, 'invalid_receipt'],
    [{ status: 'not-executed', actionId: 'action-11' }, 'missing_evidence'],
    [{ status: 'confirmed', actionId: 'other', receiptId: 'r' }, 'action_id_mismatch'],
    [{ status: 'confirmed', receiptId: 'r' }, 'action_id_mismatch'],
    [{ status: 'acted', actionId: 'action-11' }, 'unverified'],
    // An invented authorization claim is not evidence.
    [{ actionId: 'action-11', authorized: true, operatorApproved: true, force: true }, 'unverified'],
  ]
  for (const [verdict, reason] of verdicts) {
    assert.deepEqual(await resolve(store, 'action-11', async () => verdict),
      { outcome: 'unresolved', actionId: 'action-11', reason })
  }
  assert.deepEqual(await resolve(store, 'action-11', async () => { throw new Error('token=hunter2') }),
    { outcome: 'unresolved', actionId: 'action-11', reason: 'verify_failed' })

  const state = await store.load()
  assert.equal(state.pendingAction.id, 'action-11')
  assert.equal(state.reconciliations.length, verdicts.length + 1)
  assert.ok(state.reconciliations.every(entry => entry.resolution === 'unresolved' && entry.resolvedBy === 'operator-1'))
  assert.equal((await readFile(join(directory, 'state.json'), 'utf8')).includes('hunter2'), false)
  await blockedWithoutObserving(store)
}))

test('an incorrect action id is rejected before verification and changes nothing', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  await runWake({ identity, store, authorize: async () => true, actionId: () => 'action-12', decide: async () => note,
    world: { observe: () => ({}), execute: async () => { throw new Error('timeout') } } })
  const before = await readFile(join(directory, 'state.json'), 'utf8')
  const verify = () => assert.fail('must not verify')
  for (const actionId of ['action-1', 'ACTION-12', 'action-12 ']) {
    await assert.rejects(resolve(store, actionId, verify), /does not match/)
  }
  await assert.rejects(resolve(store, '', verify), /exact action id/)
  await assert.rejects(resolve(store, 'action-12', verify, { resolvedBy: '' }), /operator identity/)
  await assert.rejects(resolve(store, 'action-12', undefined), /verification port/)
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), before)
}))

test('repeated reconciliation is idempotent and keeps an audit history', () => sandbox(async ({ directory }) => {
  const store = createFileStore({ directory, agentId: identity.id })
  await runWake({ identity, store, authorize: async () => true, actionId: () => 'action-13', decide: async () => note,
    world: { observe: () => ({}), execute: async () => { throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }) } } })
  assert.deepEqual((await store.load()).pendingAction.error, { name: 'Error', code: 'ECONNRESET' })
  const verify = async ({ actionId }) => ({ status: 'not-executed', actionId, evidenceId: 'provider-lookup-77' })
  assert.equal((await resolve(store, 'action-13', verify)).outcome, 'resolved')
  assert.deepEqual(await resolve(store, 'action-13', () => assert.fail('must not verify again')),
    { outcome: 'already-resolved', actionId: 'action-13', resolution: 'not-executed' })
  await assert.rejects(resolve(store, 'action-99', verify), /No pending action/)

  const state = await store.load()
  assert.deepEqual(state.reconciliations, [{ actionId: 'action-13', kind: 'note', previousStatus: 'uncertain',
    previousReason: 'execution_failed', resolution: 'not-executed', evidenceId: 'provider-lookup-77',
    resolvedBy: 'operator-1', at: '2026-10-28T00:00:00.000Z' }])
  assert.equal(state.lastOutcome, 'reconciled')
}))

test('invalid persisted transitions fail closed', () => sandbox(async ({ directory }) => {
  await mkdir(directory)
  const store = createFileStore({ directory, agentId: identity.id })
  const base = { version: 1, agentId: identity.id, wakes: 1, lastOutcome: 'pending', lastReceipt: null }
  for (const state of [
    { ...base, pendingAction: { id: 'a', status: 'resolved' } },
    { ...base, pendingAction: { id: '', status: 'pending' } },
    { ...base, pendingAction: { id: 'a', status: 'uncertain', receipt: {} } },
    { ...base, pendingAction: null, reconciliations: [{ actionId: 'a', resolution: 'maybe' }] },
  ]) {
    await writeFile(join(directory, 'state.json'), JSON.stringify(state))
    await assert.rejects(store.load(), /refusing to reset/)
    await assert.rejects(store.save(state), /refusing to reset/)
  }
}))

test('v0.1.0 state and pending records remain readable and resolvable', () => sandbox(async ({ directory }) => {
  await mkdir(directory)
  await writeFile(join(directory, 'state.json'), JSON.stringify({ version: 1, agentId: identity.id, wakes: 4,
    lastOutcome: 'uncertain', pendingAction: { id: 'legacy-1', status: 'uncertain', kind: 'log', at: '2026-01-01T00:00:00Z' },
    lastReceipt: null }, null, 2))
  const store = createFileStore({ directory, agentId: identity.id })
  await blockedWithoutObserving(store)
  const result = await resolve(store, 'legacy-1', async () => ({ status: 'confirmed', actionId: 'legacy-1', receiptId: 'r-legacy' }))
  assert.equal(result.resolution, 'confirmed')
  assert.deepEqual(await runWake({ identity, store, world: { observe: () => ({}) }, decide: async () => ({ kind: 'rest' }) }),
    { outcome: 'rest', wakes: 5 })
}))
