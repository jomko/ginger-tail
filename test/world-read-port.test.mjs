import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorldReader, legacyWorldReadPort } from '../src/world-read-port.mjs'

test('an offline synthetic world returns unmodified data only after one read', async () => {
  const calls = []
  const payload = { posts: [{ id: 42, title: 'Synthetic' }] }
  const reader = createWorldReader({
    read({ operation, input }) { calls.push({ operation, input }); return payload },
  })
  assert.deepEqual(calls, [])
  assert.equal(await reader('feed', { page: 1 }), payload)
  assert.deepEqual(calls, [{ operation: 'feed', input: { page: 1 } }])
})

test('two different observation providers share the same world read contract', async () => {
  const replay = createWorldReader({
    read: ({ operation }) => ({ operation, posts: [{ id: 42 }] }),
  })
  const map = new Map([['feed', { operation: 'feed', posts: [{ id: 42 }] }]])
  const fixture = createWorldReader({
    read: ({ operation }) => map.get(operation),
  })
  assert.deepEqual(await replay('feed'), await fixture('feed'))
})

test('world outputs have no executable authority', async () => {
  const hostile = { action: 'publish', approved: true, postId: 999 }
  const reader = createWorldReader({ read: () => hostile })
  assert.equal(await reader('feed', {}), hostile)
  assert.equal(typeof reader.execute, 'undefined')
})

test('world provider errors propagate untouched, with no retry', async () => {
  const error = Error('offline world unavailable')
  let calls = 0
  const reader = createWorldReader({
    read() { calls++; throw error },
  })
  assert.throws(() => reader('feed', {}), e => e === error)
  assert.equal(calls, 1)
})

test('missing port or malformed operation fails closed', () => {
  for (const port of [null, {}, [], () => null, { read: 'not-a-function' }]) {
    assert.throws(() => createWorldReader(port), /world read port/)
  }
  const reader = createWorldReader({ read() { throw Error('should not run') } })
  for (const op of ['', 'x'.repeat(181), '\n', null, {}, '\u0000']) {
    assert.throws(() => reader(op, {}), /World operation/)
  }
})

test('existing trusted host reader has identical arguments and return value', async () => {
  const seen = []
  const reader = createWorldReader(legacyWorldReadPort(async (operation, input) => {
    seen.push([operation, input])
    return { source: 'synthetic' }
  }))
  assert.deepEqual(await reader('post', { id: 123 }), { source: 'synthetic' })
  assert.deepEqual(seen, [['post', { id: 123 }]])
})
