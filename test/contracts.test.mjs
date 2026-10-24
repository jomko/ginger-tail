import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WAKE_CONTRACT_VERSION, MAX_ACTION_BYTES, MAX_OBSERVATION_BYTES,
  assertAgentIdentity, assertWakePorts, parseWakeDecision,
  assertBoundedObservation, isConfirmedActionReceipt,
} from '../src/contracts.mjs'
import { runWake, createFileStore } from '../src/index.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('the runtime contract has a stable, explicit version and bounds', () => {
  assert.equal(WAKE_CONTRACT_VERSION, 1)
  assert.equal(MAX_ACTION_BYTES, 4096)
  assert.equal(MAX_OBSERVATION_BYTES, 16384)
})

test('agent identity requires an id but does not prescribe a character', () => {
  assertAgentIdentity({ id: 'a-synthetic-agent', character: 'optional' })
  for (const input of [null, {}, { id: '' }, { id: '   ' }, { id: 3 }]) {
    assert.throws(() => assertAgentIdentity(input), /Identity/)
  }
})

test('all required ports are explicit and missing ones fail closed', () => {
  const store = { withLock: async callback => callback(), load: async () => ({}), save: async () => {} }
  const world = { observe: async () => ({}) }
  const decide = async () => ({ kind: 'rest' })
  assertWakePorts({ store, world, decide, authorize: async () => false })
  assert.throws(() => assertWakePorts({ store, world, decide }), /Missing runtime adapter/)
  assert.throws(() => assertWakePorts({ store, world, decide, authorize: true }), /Missing runtime adapter/)
  assert.throws(() => assertWakePorts({ store, world: {}, decide, authorize: async () => false }), /Missing runtime adapter/)
})

test('unknown or malformed model proposals do not become allowed actions', () => {
  assert.deepEqual(parseWakeDecision({ kind: 'rest', extra: 'ignored' }), { kind: 'rest' })
  for (const bad of [null, { kind: 'post' }, { kind: 'action' },
    { kind: 'action', action: { kind: 'post', payload: [] } },
    { kind: 'action', action: { kind: '../escape', payload: {} } },
    { kind: 'action', action: { kind: 'post', payload: null } }]) {
    assert.throws(() => parseWakeDecision(bad), /Invalid decision/)
  }
})

test('model proposals and observations retain established byte ceilings', () => {
  assert.doesNotThrow(() => assertBoundedObservation({ text: 'short' }))
  assert.throws(() => assertBoundedObservation({ content: 'a'.repeat(17000) }), /Observation exceeds/)
  assert.throws(() => parseWakeDecision({ kind: 'action',
    action: { kind: 'log', payload: { body: 'b'.repeat(5000) } } }), /Action proposal exceeds/)
  assert.deepEqual(parseWakeDecision({ kind: 'action', action: { kind: 'log', payload: {} } }),
    { kind: 'action', action: { kind: 'log', payload: {} } })
})

test('only a bounded affirmative receipt can confirm an external side effect', () => {
  assert.equal(isConfirmedActionReceipt({ status: 'confirmed', receiptId: 'test-1' }), true)
  for (const bad of [null, {}, { status: 'pending', receiptId: 'x' },
    { status: 'confirmed', receiptId: '' },
    { status: 'confirmed', receiptId: 42 },
    { status: 'confirmed', receiptId: 'x'.repeat(201) }]) {
    assert.equal(isConfirmedActionReceipt(bad), false)
  }
})

test('existing offline runWake consumes the shared contracts and keeps resting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ginger-tail-contract-'))
  try {
    const identity = { id: 'synthetic-cat' }
    const store = createFileStore({ directory, agentId: identity.id })
    const result = await runWake({
      identity, store, world: { observe: async () => ({ sight: 'sunlight' }) },
      decide: async () => ({ kind: 'rest' }),
    })
    assert.deepEqual(result, { outcome: 'rest', wakes: 1 })
    assert.equal((await store.load()).pendingAction, null)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
