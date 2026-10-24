import test from 'node:test'
import assert from 'node:assert/strict'
import { createCognitionControl } from '../src/cognition-control.mjs'
import { explorationTurns, closingTurn } from '../src/cognition-journey.mjs'

class InvalidReply extends Error {
  constructor(category = 'invalid-action') { super(category); this.category = category }
}

function fixture(replies, options = {}) {
  const trace = []
  const rejected = []
  const control = createCognitionControl({
    model: async prompt => { trace.push('model:' + prompt); return replies.shift() },
    parseReply: reply => {
      if (!reply || typeof reply.action !== 'string') throw new InvalidReply()
      return reply
    },
    invalidReason: err => err instanceof InvalidReply ? err.category : null,
    invalidActionError: category => new InvalidReply(category),
    onInvalidReply: category => rejected.push(category),
    explorationAction: action => action.action === 'read',
    maxExplorationSteps: 2,
    maxModelCalls: 5,
    ...options,
  })
  return { control, trace, rejected }
}

test('synthetic agent may rest immediately; no closing or forced extra decision', async () => {
  const { control, trace } = fixture([{ action: 'rest' }])
  let ended = false
  const executed = []
  for await (const action of explorationTurns({
    control, beforeTurn: () => trace.push('prepare'), prompt: () => 'choose',
  })) {
    executed.push(action.action)
    if (action.action === 'rest') { ended = true; break }
  }
  assert.equal(ended, true)
  assert.deepEqual(executed, ['rest'])
  assert.deepEqual(trace, ['prepare', 'model:choose'])
  assert.deepEqual(control.snapshot(), { modelCalls: 1, explored: 0, invalidReplies: 0 })
})

test('exploration counts only classified actions and keeps world effects with the host', async () => {
  const { control } = fixture([{ action: 'note' }, { action: 'read' }, { action: 'read' },
    { action: 'unexpected' }])
  const handled = []
  for await (const action of explorationTurns({ control, prompt: () => 'explore' })) {
    // A host adapter decides what each action does; the engine never executes it.
    handled.push([action.action, control.snapshot().explored])
  }
  assert.deepEqual(handled, [['note', 0], ['read', 1], ['read', 2]])
  assert.equal(control.callsLeft(), 2)
})

test('the last model call is reserved for the closing decision and allowlisted', async () => {
  const { control, rejected } = fixture([
    { action: 'read' }, { action: 'read' }, { action: 'search' }, { action: 'rest' },
  ], { maxExplorationSteps: 2, maxModelCalls: 4 })
  const seen = []
  for await (const action of explorationTurns({ control, prompt: () => 'walk' })) {
    seen.push(action.action)
  }
  assert.deepEqual(seen, ['read', 'read'])
  const result = await closingTurn({
    control, prompt: () => 'close', allowed: action => action.action === 'rest',
  })
  assert.deepEqual(result, { decision: { action: 'rest' }, noCalls: false })
  assert.deepEqual(rejected, ['not-allowed-here'])
  assert.equal(control.callsLeft(), 0)
})

test('invalid model decision yields null once, without executing a world action', async () => {
  const { control, rejected } = fixture([null, null, { action: 'read' }])
  const seen = []
  for await (const decision of explorationTurns({ control, prompt: () => 'choose' })) {
    seen.push(decision)
  }
  assert.deepEqual(seen, [null])
  assert.deepEqual(rejected, ['invalid-action', 'invalid-action'])
  assert.deepEqual(control.snapshot(), { modelCalls: 2, explored: 0, invalidReplies: 2 })
})

test('no closing model call occurs after model budget exhaustion', async () => {
  const { control } = fixture([], { maxModelCalls: 2, maxExplorationSteps: 3 })
  control.ask('first')
  control.ask('second')
  assert.deepEqual(await closingTurn({ control, prompt: () => { throw Error('should not run') } }),
    { decision: null, noCalls: true })
})

test('breaking an exploration walk releases the controller for a later bounded walk', async () => {
  const { control } = fixture([{ action: 'note' }, { action: 'rest' }])
  for await (const action of explorationTurns({ control, prompt: () => 'walk' })) {
    assert.equal(action.action, 'note')
    break
  }
  const seen = []
  for await (const action of explorationTurns({ control, prompt: () => 'resume' })) {
    seen.push(action.action)
    break
  }
  assert.deepEqual(seen, ['rest'])
})

test('a concurrent walk or closing decision fails closed while exploration is active', async () => {
  const { control } = fixture([{ action: 'read' }])
  const first = explorationTurns({ control, prompt: () => 'walk' })
  assert.deepEqual(await first.next(), { value: { action: 'read' }, done: false })
  const second = explorationTurns({ control, prompt: () => 'walk' })
  await assert.rejects(second.next(), /already active/)
  await assert.rejects(closingTurn({ control, prompt: () => 'close' }), /still active/)
  await first.return()
  assert.equal((await closingTurn({ control, prompt: () => 'close' })).decision?.action, undefined)
})

test('a model transport failure propagates without extra turns or automatic retries', async () => {
  let invoked = 0
  const { control } = fixture([], {
    model: async () => { invoked++; throw Error('model transport failed') },
  })
  await assert.rejects(async () => {
    for await (const action of explorationTurns({ control, prompt: () => 'walk' })) {
      void action
    }
  }, /model transport failed/)
  assert.equal(invoked, 1)
  assert.equal(control.snapshot().modelCalls, 1)
})

test('misconfigured host callbacks are rejected before a model call', async () => {
  const { control } = fixture([{ action: 'rest' }])
  await assert.rejects(explorationTurns({ control }).next(), /Exploration callbacks/)
  await assert.rejects(closingTurn({ control, allowed: 'yes' }), /Closing callbacks/)
  assert.equal(control.snapshot().modelCalls, 0)
})
