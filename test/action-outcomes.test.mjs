import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyActionOutcome, createActionOutcomeGate } from '../src/action-outcomes.mjs'
import { runWake, createFileStore } from '../src/index.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('trusted bridge outcomes are explicitly classified without interpreting model text', () => {
  for (const status of ['committed', 'confirmed']) {
    const result = status === 'confirmed'
      ? { status, receiptId: 'receipt-1' } : { status }
    assert.equal(classifyActionOutcome(result), 'confirmed')
  }
  for (const status of ['blocked', 'failed']) {
    assert.equal(classifyActionOutcome({ status }), 'rejected')
  }
  assert.equal(classifyActionOutcome({ status: 'uncertain' }), 'uncertain')
})

test('malformed or unfamiliar bridge outcomes always remain uncertain', () => {
  for (const value of [null, undefined, '', 'committed', {}, [], { status: 'ok' },
    { status: 'confirmed' }, { status: 'confirmed', receiptId: '' },
    { status: 'confirmed', receiptId: 42 },
    { status: 'confirmed', receiptId: 'x'.repeat(201) }]) {
    assert.equal(classifyActionOutcome(value), 'uncertain')
  }
})

test('confirmed and rejected writes do not block later attempts in the same wake', () => {
  const gate = createActionOutcomeGate()
  assert.equal(gate.blockedReason(), null)
  assert.equal(gate.observe({ status: 'committed' }), 'confirmed')
  assert.equal(gate.blockedReason(), null)
  assert.equal(gate.observe({ status: 'failed' }), 'rejected')
  assert.equal(gate.observe({ status: 'blocked' }), 'rejected')
  assert.equal(gate.blockedReason(), null)
})

test('an uncertain trusted write blocks subsequent attempts without a reset or retry', () => {
  const gate = createActionOutcomeGate()
  assert.equal(gate.observe({ status: 'uncertain' }), 'uncertain')
  assert.equal(gate.blockedReason(), 'earlier write uncertain')
  assert.equal(gate.observe({ status: 'committed' }), 'confirmed')
  assert.equal(gate.blockedReason(), 'earlier write uncertain')
})

test('missing responses also block subsequent writes, and reason is host-defined', () => {
  const gate = createActionOutcomeGate({ reason: 'earlier external action uncertain' })
  assert.equal(gate.observe(undefined), 'uncertain')
  assert.equal(gate.blockedReason(), 'earlier external action uncertain')
  assert.throws(() => createActionOutcomeGate({ reason: '' }), /nonempty block reason/)
})

test('the existing offline wake still persists unknown execution receipts as uncertain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tail-outcome-'))
  try {
    const identity = { id: 'synthetic-cat' }
    const store = createFileStore({ directory, agentId: identity.id })
    const first = await runWake({
      identity, store,
      world: {
        observe: async () => ({ synthetic: true }),
        execute: async () => ({ status: 'confirmed', receiptId: '' }),
      },
      decide: async () => ({ kind: 'action', action: { kind: 'note', payload: {} } }),
      authorize: async () => true,
    })
    assert.equal(first.outcome, 'uncertain')
    assert.equal((await store.load()).pendingAction.status, 'uncertain')
    const second = await runWake({
      identity, store, world: { observe: () => { throw Error('must not observe') } },
      decide: async () => ({ kind: 'rest' }),
    })
    assert.equal(second.outcome, 'blocked')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
