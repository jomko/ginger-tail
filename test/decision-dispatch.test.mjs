import test from 'node:test'
import assert from 'node:assert/strict'
import { createDecisionDispatcher } from '../src/decision-dispatch.mjs'

test('a trusted host dispatches an approved read and continues', async () => {
  const seen = []
  const dispatch = createDecisionDispatcher({ read: action => { seen.push(action.postId) } })
  assert.equal(await dispatch({ action: 'read', postId: 42 }), 'continue')
  assert.deepEqual(seen, [42])
})

test('rest and carry are voluntary stops, not automatic closing turns', async () => {
  const dispatch = createDecisionDispatcher({
    rest: () => 'stop',
    carry: () => 'stop',
    read: () => 'continue',
  })
  assert.equal(await dispatch({ action: 'rest' }), 'stop')
  assert.equal(await dispatch({ action: 'carry' }), 'stop')
  assert.equal(await dispatch({ action: 'read' }), 'continue')
})

test('unknown actions cannot reach a host side effect', async () => {
  let effects = 0
  const dispatch = createDecisionDispatcher({ write: () => { effects++ } })
  for (const decision of [
    null, {}, [], { action: 'delete' }, { action: 'constructor' },
    { action: '__proto__' }, { action: 'toString' },
  ]) await assert.rejects(dispatch(decision), /Unregistered cognition action/)
  assert.equal(effects, 0)
})

test('closing phase has only explicitly registered handlers', async () => {
  const write = []
  const explore = createDecisionDispatcher({
    read: () => undefined,
    rest: () => 'stop',
  })
  const closing = createDecisionDispatcher({
    rest: () => 'stop',
    comment: x => { write.push(x.body) },
  })
  assert.equal(await explore({ action: 'read' }), 'continue')
  await assert.rejects(closing({ action: 'read' }), /Unregistered/)
  assert.equal(await closing({ action: 'comment', body: 'synthetic' }), 'continue')
  assert.deepEqual(write, ['synthetic'])
})

test('dispatch propagates host error and does not retry an uncertain write', async () => {
  let writes = 0
  const dispatch = createDecisionDispatcher({
    write: () => { writes++; throw new Error('uncertain external result') },
  })
  await assert.rejects(dispatch({ action: 'write' }), /uncertain external result/)
  assert.equal(writes, 1)
})

test('misconfigured handlers and invalid flow signals fail closed', async () => {
  for (const invalid of [null, {}, [], { write: 'ok' }, { 'Bad Key': () => {} }]) {
    assert.throws(() => createDecisionDispatcher(invalid), /handler/i)
  }
  const dispatch = createDecisionDispatcher({ read: () => true })
  await assert.rejects(dispatch({ action: 'read' }), /invalid flow signal/)
})

test('host can keep provenance and authorization gates private', async () => {
  let actions = 0
  const checked = createDecisionDispatcher({
    write: async action => {
      if (action.approved !== true) throw new Error('not authorized by host')
      actions++
    },
  })
  await assert.rejects(checked({ action: 'write', approved: false }), /not authorized/)
  assert.equal(actions, 0)
  await checked({ action: 'write', approved: true })
  assert.equal(actions, 1)
})
