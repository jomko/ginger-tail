import test from 'node:test'
import assert from 'node:assert/strict'
import { createCognitionControl } from '../src/cognition-control.mjs'
import { runWake, createFileStore } from '../src/index.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class InvalidReply extends Error {
  constructor(category) { super(category); this.category = category }
}
const isInvalid = error => error instanceof InvalidReply ? error.category : null
const create = (answers, overrides = {}) => {
  const prompts = []
  const invalid = []
  const control = createCognitionControl({
    model: async prompt => { prompts.push(prompt); return answers.shift() },
    parseReply: reply => {
      if (!reply?.action) throw new InvalidReply('not-object')
      return reply
    },
    invalidReason: isInvalid,
    invalidActionError: reason => new InvalidReply(reason),
    onInvalidReply: reason => invalid.push(reason),
    retryNote: '\nRetry: choose one permitted action.',
    explorationAction: action => ['read', 'search'].includes(action.action),
    ...overrides,
  })
  return { control, prompts, invalid }
}

test('a synthetic agent may rest immediately without performing other actions', async () => {
  const { control, prompts } = create([{ action: 'rest' }])
  assert.deepEqual(await control.decide('Choose action'), { action: 'rest' })
  assert.deepEqual(prompts, ['Choose action'])
  assert.deepEqual(control.snapshot(), { modelCalls: 1, explored: 0, invalidReplies: 0 })
})

test('exploration budget stops at its ceiling without treating it as a model-call target', async () => {
  const { control } = create([], { maxExplorationSteps: 2 })
  assert.equal(control.canExplore(), true)
  control.recordAction({ action: 'rest' })
  assert.equal(control.snapshot().explored, 0)
  control.recordAction({ action: 'read' })
  assert.equal(control.canExplore(), true)
  control.recordAction({ action: 'search' })
  assert.equal(control.canExplore(), false)
  assert.equal(control.callsLeft(), 15)
})

test('one last model call stays reserved for a closing decision', async () => {
  const { control } = create(Array.from({ length: 15 }, () => ({ action: 'search' })), {
    maxExplorationSteps: 30,
  })
  for (let i = 0; i < 14; i++) {
    assert.equal(control.canExplore(), true)
    control.recordAction(await control.decide('Explore'))
  }
  assert.equal(control.canExplore(), false)
  assert.equal(control.callsLeft(), 1)
  assert.equal((await control.decide('Close')).action, 'search')
  assert.equal(control.callsLeft(), 0)
  assert.equal(await control.decide('Never run'), null)
  assert.throws(() => control.ask('Exhausted'), /model-call-limit/)
})

test('only an invalid reply is retried once with a technical note', async () => {
  const { control, prompts, invalid } = create([null, { action: 'rest' }])
  assert.deepEqual(await control.decide('Decision'), { action: 'rest' })
  assert.deepEqual(invalid, ['not-object'])
  assert.equal(prompts[0], 'Decision')
  assert.match(prompts[1], /^Decision\nRetry:/)
  assert.equal(control.snapshot().modelCalls, 2)
})

test('a second invalid reply in the same wake ends the decision as null', async () => {
  const { control, invalid } = create([null, null, { action: 'rest' }])
  assert.equal(await control.decide('Decision'), null)
  assert.deepEqual(invalid, ['not-object', 'not-object'])
  assert.equal(control.snapshot().modelCalls, 2)
})

test('invalid reply budget is shared across decisions of one wake', async () => {
  const { control } = create([null, { action: 'read' }, null, { action: 'rest' }])
  assert.equal((await control.decide('First')).action, 'read')
  assert.equal(await control.decide('Second'), null)
  assert.equal(control.snapshot().modelCalls, 3)
})

test('closing allowlist rejects browsing and retries without executing it', async () => {
  const { control, invalid } = create([{ action: 'search' }, { action: 'rest' }])
  assert.deepEqual(await control.decide('Close', action => action.action === 'rest'), { action: 'rest' })
  assert.deepEqual(invalid, ['not-allowed-here'])
})

test('model transport failures are fatal and never retried', async () => {
  let calls = 0
  const { control, invalid } = create([], {
    model: async () => { calls++; throw new Error('transport-failed') },
  })
  await assert.rejects(control.decide('Decision'), /transport-failed/)
  assert.equal(calls, 1)
  assert.equal(control.callsLeft(), 14)
  assert.deepEqual(invalid, [])
})

test('the existing synthetic runWake can use the same cognition controller', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tail-cognition-'))
  try {
    const { control } = create([{ action: 'rest' }])
    const identity = { id: 'synthetic-cat' }
    const result = await runWake({
      identity, store: createFileStore({ directory, agentId: identity.id }),
      world: { observe: async () => ({ event: 'Synthetic sunlight' }) },
      decide: async () => {
        const reply = await control.decide('Rest or act')
        return reply?.action === 'rest' ? { kind: 'rest' } : { kind: 'invalid' }
      },
    })
    assert.deepEqual(result, { outcome: 'rest', wakes: 1 })
    assert.equal(control.snapshot().modelCalls, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('controller refuses malformed host contract adapters', () => {
  assert.throws(() => createCognitionControl(), /Invalid cognition control configuration/)
  assert.throws(() => create([], { maxModelCalls: 1 }), /Invalid cognition control configuration/)
  assert.throws(() => create([], { invalidReason: null }), /Invalid cognition control configuration/)
})
