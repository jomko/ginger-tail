import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileStore, runWake } from '../src/index.mjs'

const identity = { id: 'synthetic-cat' }
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'ginger-tail-test-'))
  const store = createFileStore({ directory, agentId: identity.id })
  try { return await callback({ store, directory }) }
  finally { await rm(directory, { recursive: true, force: true }) }
}
function options(store, overrides = {}) {
  return { identity, store, world: { observe: async () => ({ event: 'Synthetic observation' }) },
    decide: async () => ({ kind: 'rest' }), ...overrides }
}

test('one offline wake can rest and persists across wake invocations', async () => fixture(async ({ store, directory }) => {
  const first = await runWake(options(store))
  assert.deepEqual(first, { outcome: 'rest', wakes: 1 })
  const second = await runWake(options(store))
  assert.deepEqual(second, { outcome: 'rest', wakes: 2 })
  assert.equal((await store.load()).wakes, 2)
  assert.equal((await readFile(join(directory, 'state.json'), 'utf8')).includes('Synthetic observation'), false)
}))

test('proposed actions are denied by default and never executed', async () => fixture(async ({ store }) => {
  let attempts = 0
  const result = await runWake(options(store, { decide: async () => ({ kind: 'action', action: { kind: 'log', payload: { message: 'Nope' } } }),
    world: { observe: async () => ({}), execute: async () => { attempts++ } } }))
  assert.equal(result.outcome, 'denied')
  assert.equal(attempts, 0)
  assert.equal((await store.load()).pendingAction, null)
}))

test('authorized actions reserve id before execution and confirm a receipt', async () => fixture(async ({ store }) => {
  let reserved
  const result = await runWake(options(store, { decide: async () => ({ kind: 'action', action: { kind: 'log', payload: { message: 'Hello' } } }),
    authorize: async () => true, actionId: () => 'action-123', now: () => '2026-01-01T00:00:00Z',
    world: { observe: async () => ({}), execute: async ({ actionId }) => { reserved = await store.load(); assert.equal(actionId, 'action-123'); return { status: 'confirmed', receiptId: 'receipt-456' } } } }))
  assert.equal(reserved.pendingAction.status, 'pending')
  assert.equal(result.outcome, 'acted')
  assert.deepEqual((await store.load()).lastReceipt, { actionId: 'action-123', receiptId: 'receipt-456', kind: 'log' })
  assert.equal((await store.load()).pendingAction, null)
}))

test('uncertain external results block the next wake before observation', async () => fixture(async ({ store }) => {
  const initial = await runWake(options(store, { decide: async () => ({ kind: 'action', action: { kind: 'log', payload: {} } }),
    authorize: async () => true,
    world: { observe: async () => ({}), execute: async () => { throw new Error('network disconnected') } } }))
  assert.equal(initial.outcome, 'uncertain')
  let called = false
  const next = await runWake(options(store, { world: { observe: async () => { called = true; return {} } } }))
  assert.equal(next.outcome, 'blocked')
  assert.equal(next.reason, 'unresolved_action')
  assert.equal(called, false)
}))

test('invalid or corrupt state fails closed instead of being reset', async () => fixture(async ({ store, directory }) => {
  await writeFile(join(directory, 'state.json'), '{invalid', 'utf8')
  await assert.rejects(runWake(options(store)))
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), '{invalid')
}))

test('existing lock prevents concurrent actions and is not removed', async () => fixture(async ({ store, directory }) => {
  await writeFile(join(directory, 'wake.lock'), 'held', 'utf8')
  await assert.rejects(runWake(options(store)), /already locked/)
  assert.equal(await readFile(join(directory, 'wake.lock'), 'utf8'), 'held')
}))

test('invalid decisions and oversized observations cause no persistent wake or action', async () => fixture(async ({ store }) => {
  await assert.rejects(runWake(options(store, { decide: async () => ({ kind: 'post', body: 'unsafe' }) })), /Invalid decision/)
  await assert.rejects(runWake(options(store, { world: { observe: async () => ({ text: 'x'.repeat(17000) }) } })), /Observation exceeds/)
  assert.equal((await store.load()).wakes, 0)
}))

test('agent state files use restrictive permissions', async () => fixture(async ({ store, directory }) => {
  await runWake(options(store))
  const entries = await readdir(directory)
  assert.deepEqual(entries, ['state.json'])
}))
