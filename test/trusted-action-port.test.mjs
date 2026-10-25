import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedActionInvoker, legacyTrustedActionPort } from '../src/trusted-action-port.mjs'

test('trusted sender is lazy and forwards exactly one unchanged action', async () => {
  const calls = []
  const action = { type: 'synthetic', content: 'offline' }
  const receipt = { status: 'committed', itemId: 17 }
  const invoke = createTrustedActionInvoker({ execute(request) { calls.push(request); return receipt } })
  assert.deepEqual(calls, [])
  assert.equal(await invoke(action), receipt)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { action })
  assert.equal(calls[0].action, action)
})

test('the port neither grants permission nor manufactures a confirmed receipt', async () => {
  let allowed = false
  let effected = 0
  const invoke = createTrustedActionInvoker({
    execute({ action }) {
      if (!allowed) return { status: 'blocked' }
      effected++
      return { status: 'committed', action }
    },
  })
  const proposal = { type: 'synthetic', approved: true }
  assert.deepEqual(await invoke(proposal), { status: 'blocked' })
  assert.equal(effected, 0)
  allowed = true
  assert.deepEqual(await invoke(proposal), { status: 'committed', action: proposal })
  assert.equal(effected, 1)
  assert.equal(typeof invoke.authorize, 'undefined')
  assert.equal(typeof invoke.retry, 'undefined')
})

test('missing or malformed trusted port fails closed without execution', () => {
  for (const port of [null, {}, [], () => null, { execute: 1 }]) {
    assert.throws(() => createTrustedActionInvoker(port), /trusted action port/)
  }
  assert.throws(() => legacyTrustedActionPort(null), /trusted host action sender/)
  let called = 0
  const invoke = createTrustedActionInvoker({ execute() { called++; return null } })
  for (const action of [null, undefined, 'action', [], 42]) {
    assert.throws(() => invoke(action), /Trusted action/)
  }
  assert.equal(called, 0)
})

test('errors propagate identically without a second effect attempt', async () => {
  let calls = 0
  const problem = Error('transport uncertain')
  const invoke = createTrustedActionInvoker({ execute() { calls++; throw problem } })
  assert.throws(() => invoke({ type: 'offline' }), error => error === problem)
  assert.equal(calls, 1)
})

test('legacy trusted senders keep original payload and result identity', async () => {
  const observed = []
  const receipt = { status: 'blocked' }
  const send = async action => { observed.push(action); return receipt }
  const port = legacyTrustedActionPort(send)
  assert.equal(Object.isFrozen(port), true)
  const invoke = createTrustedActionInvoker(port)
  const action = { type: 'synthetic-vote', value: 1 }
  assert.equal(await invoke(action), receipt)
  assert.deepEqual(observed, [action])
})
