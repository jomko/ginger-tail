import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  isInterestId, replayInterestEvents, planInterestTransition, interestSnapshot,
  cloneInterestSnapshot, applyInterestEvents,
} from '../src/attention-core.mjs'

const renderInterest = item => item.text + (item.postId ? '\nref:' + item.postId : '') + '\n'
const opts = { now: new Date('2026-01-01T12:00:00Z'), newId: () => 'abcdef0123', renderInterest }
const empty = () => replayInterestEvents([], renderInterest)
const action = (snapshot, request, overrides = {}) => planInterestTransition(snapshot, request, { ...opts, ...overrides })
const replay = events => replayInterestEvents(events, renderInterest)

test('source-agnostic attention starts empty and uses the legacy ten-hex ID contract', () => {
  const state = empty()
  assert.equal(state.active, null)
  assert.equal(state.dormant.length, 0)
  assert.equal(state.closed.length, 0)
  assert.equal(state.writable, true)
  assert.equal(isInterestId('abcdef0123'), true)
  assert.equal(isInterestId('../private'), false)
})

test('carry opens an interest; a second distinct carry defers the old one', () => {
  const first = action(empty(), { op: 'carry', text: 'Synthetic idea A', postId: 1 })
  assert.equal(first.id, 'abcdef0123')
  assert.deepEqual(first.events.map(e => e.op), ['open'])
  assert.equal(first.snapshot.active.text, 'Synthetic idea A')
  const second = action(first.snapshot, { op: 'carry', text: 'Synthetic idea B', postId: 2 },
    { newId: () => 'abcdef0124' })
  assert.deepEqual(second.events.map(e => e.op), ['defer', 'open'])
  assert.equal(second.snapshot.active.text, 'Synthetic idea B')
  assert.equal(second.snapshot.dormant[0].text, 'Synthetic idea A')
  assert.equal(replay([...first.events, ...second.events]).active.text, 'Synthetic idea B')
})

test('defer, resume and close are explicit; dormant interests do not expire by time', () => {
  const first = action(empty(), { op: 'carry', text: 'Synthetic thought' })
  const deferred = action(first.snapshot, { op: 'defer' })
  assert.equal(deferred.snapshot.active, null)
  assert.equal(deferred.snapshot.dormant[0].id, first.id)
  assert.deepEqual(deferred.snapshot.closed, [])
  const resumed = action(deferred.snapshot, { op: 'resume', id: first.id })
  assert.equal(resumed.snapshot.active.id, first.id)
  assert.equal(resumed.snapshot.dormant.length, 0)
  const closed = action(resumed.snapshot, { op: 'close' })
  assert.equal(closed.snapshot.active, null)
  assert.equal(closed.snapshot.closed.length, 1)
  assert.equal(action(closed.snapshot, { op: 'resume', id: first.id }).refused, 'closed-is-final')
})

test('invalid transitions refuse without mutating the input snapshot', () => {
  const state = empty()
  assert.equal(action(state, { op: 'defer' }).refused, 'no-active')
  assert.equal(action(state, { op: 'resume', id: '1234567890' }).refused, 'unknown-id')
  assert.equal(action(state, { op: 'carry', text: ' ' }).refused, 'invalid-carry')
  assert.equal(action(state, { op: 'publish' }).refused, 'unsupported-op')
  assert.equal(state.items.size, 0)
})

test('event replay is fail closed for corrupted and impossible histories', () => {
  assert.throws(() => replay([{ v: 1, op: 'open', id: 'abcdef0123' }]), /malformed event/)
  assert.throws(() => replay([{ v: 1, at: '2026-01-01T00:00:00Z', op: 'resume', id: 'abcdef0123' }]), /non-dormant/)
  assert.throws(() => replay([{ v: 1, at: '2026-01-01T00:00:00Z', op: 'open', id: 'abcdef0123', text: 'x', postId: -1 }]), /invalid interest/)
})

test('known projection fingerprint preserves replay-compatible interest rendering', () => {
  const first = action(empty(), { op: 'carry', text: 'Synthetic thought', postId: 1 })
  const expected = createHash('sha256').update(renderInterest(first.snapshot.active)).digest('hex')
  assert.ok(first.snapshot.known.has(expected))
  const replayed = replay(first.events)
  assert.ok(replayed.known.has(expected))
  const copy = cloneInterestSnapshot(replayed)
  assert.notEqual(copy.items, replayed.items)
  assert.notEqual(copy.known, replayed.known)
  assert.equal(interestSnapshot(copy.items, copy.known).active.text, 'Synthetic thought')
})

test('renderer is explicitly injected: no social network is hard-coded', () => {
  assert.throws(() => replayInterestEvents([]), /renderer is required/)
  assert.throws(() => planInterestTransition(empty(), { op: 'defer' }), /renderer is required/)
  assert.throws(() => applyInterestEvents(new Map(), new Set(), []), /renderer is required/)
})
