import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { createFileStore, runWake, StateDurabilityError } from '../src/index.mjs'
import { identity, sandbox } from './helpers.mjs'

// Fault injection patches the shared node:fs/promises object for one test
// (t.mock restores it). These tests prove error handling and ordering; they
// cannot prove what a real disk retains after power loss.
const realOpen = fs.open
const injected = code => Object.assign(new Error('injected ' + code), { code })
const isTemporary = path => /\.state-[0-9a-f-]{36}\.tmp$/.test(String(path))

function failOpenedHandle(t, match, method, code) {
  t.mock.method(fs, 'open', async (path, ...rest) => {
    const handle = await realOpen(path, ...rest)
    if (match(path, ...rest)) handle[method] = async () => { throw injected(code) }
    return handle
  })
}

async function seeded(directory) {
  const store = createFileStore({ directory, agentId: identity.id })
  await store.save({ version: 1, agentId: identity.id, wakes: 7, lastOutcome: 'rest', pendingAction: null, lastReceipt: null })
  const before = await fs.readFile(join(directory, 'state.json'), 'utf8')
  return { store, before, next: { ...JSON.parse(before), wakes: 8 } }
}

for (const [label, inject] of [
  ['temporary write', t => failOpenedHandle(t, isTemporary, 'writeFile', 'ENOSPC')],
  ['temporary fsync', t => failOpenedHandle(t, isTemporary, 'sync', 'EIO')],
  ['rename', t => t.mock.method(fs, 'rename', async () => { throw injected('EXDEV') })],
]) {
  test(`a failed ${label} leaves the previous state intact and no temporary file`, t => sandbox(async ({ directory }) => {
    const { store, before, next } = await seeded(directory)
    inject(t)
    await assert.rejects(store.save(next), /injected/)
    t.mock.restoreAll()
    assert.equal(await fs.readFile(join(directory, 'state.json'), 'utf8'), before)
    assert.deepEqual(await fs.readdir(directory), ['state.json'])
  }))
}

test('a failed directory fsync is reported, never treated as durable', t => sandbox(async ({ directory }) => {
  const { store, next } = await seeded(directory)
  failOpenedHandle(t, path => path === directory, 'sync', 'EIO')
  await assert.rejects(store.save(next), error => error instanceof StateDurabilityError &&
    error.code === 'STATE_DURABILITY_UNCONFIRMED' && error.unsupported === false && error.cause.code === 'EIO')
  t.mock.restoreAll()
  assert.deepEqual(await fs.readdir(directory), ['state.json'])
}))

test('unsupported directory fsync fails explicitly instead of silently downgrading', t => sandbox(async ({ directory }) => {
  const { store, next } = await seeded(directory)
  t.mock.method(fs, 'open', async (path, ...rest) => {
    if (path === directory) throw injected('EISDIR')
    return realOpen(path, ...rest)
  })
  await assert.rejects(store.save(next), error => error instanceof StateDurabilityError && error.unsupported === true)
}))

test('a successful save fsyncs the file before rename and the directory after it', t => sandbox(async ({ directory }) => {
  const { store, next } = await seeded(directory)
  const events = []
  t.mock.method(fs, 'open', async (path, ...rest) => {
    const handle = await realOpen(path, ...rest)
    const sync = handle.sync.bind(handle)
    handle.sync = async () => { events.push(isTemporary(path) ? 'sync-file' : path === directory ? 'sync-dir' : 'sync-other'); return sync() }
    return handle
  })
  const rename = fs.rename
  t.mock.method(fs, 'rename', async (...args) => { events.push('rename'); return rename(...args) })
  await store.save(next)
  assert.deepEqual(events, ['sync-file', 'rename', 'sync-dir'])
}))

test('no external effect runs unless its reservation is durable', t => sandbox(async ({ directory }) => {
  const { store } = await seeded(directory)
  failOpenedHandle(t, path => path === directory, 'sync', 'EIO')
  let executions = 0
  await assert.rejects(runWake({ identity, store, authorize: async () => true,
    decide: async () => ({ kind: 'action', action: { kind: 'note', payload: {} } }),
    world: { observe: () => ({}), execute: async () => { executions++; return { status: 'confirmed', receiptId: 'r' } } } }),
  StateDurabilityError)
  assert.equal(executions, 0)
}))

test('a non-durable completion after a real effect is uncertain, not acted', t => sandbox(async ({ directory }) => {
  const { store } = await seeded(directory)
  let executions = 0
  const result = await runWake({ identity, store, authorize: async () => true, actionId: () => 'action-1',
    decide: async () => ({ kind: 'action', action: { kind: 'note', payload: {} } }),
    world: { observe: () => ({}), execute: async () => {
      executions++
      failOpenedHandle(t, path => path === directory, 'sync', 'EIO') // the disk starts failing now
      return { status: 'confirmed', receiptId: 'receipt-1' }
    } } })
  assert.equal(result.outcome, 'uncertain')
  assert.equal(result.reason, 'receipt_not_persisted')
  assert.equal(result.receipt.receiptId, 'receipt-1')
  t.mock.restoreAll()
  assert.equal((await store.load()).pendingAction.id, 'action-1') // still blocks; never inferred done
  assert.equal(executions, 1)
}))

test('new state directories and files keep restrictive permissions', () => sandbox(async ({ root }) => {
  const directory = join(root, 'nested', 'state')
  const store = createFileStore({ directory, agentId: identity.id })
  await runWake({ identity, store, world: { observe: () => ({}) }, decide: async () => ({ kind: 'rest' }) })
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700)
  assert.equal((await fs.stat(join(directory, 'state.json'))).mode & 0o777, 0o600)
}))

test('a temporary file left by a crashed save is removed by the next lock holder', () => sandbox(async ({ directory }) => {
  const { store } = await seeded(directory)
  await fs.writeFile(join(directory, '.state-00000000-0000-4000-8000-000000000000.tmp'), '{"partial')
  await runWake({ identity, store, world: { observe: () => ({}) }, decide: async () => ({ kind: 'rest' }) })
  assert.deepEqual(await fs.readdir(directory), ['state.json'])
  assert.equal((await store.load()).wakes, 8)
}))
