import test from 'node:test'
import assert from 'node:assert/strict'
import { createModelInvoker, legacyModelPort } from '../src/model-port.mjs'
import { createCognitionControl } from '../src/cognition-control.mjs'

test('a synthetic local model provider receives an unchanged prompt exactly once', async () => {
  const calls = []
  const invoke = createModelInvoker({
    generate: async input => { calls.push(input); return { action: 'rest', source: 'synthetic' } },
  })
  assert.deepEqual(calls, [])
  assert.deepEqual(await invoke('Synthetic prompt.'), { action: 'rest', source: 'synthetic' })
  assert.deepEqual(calls, [{ prompt: 'Synthetic prompt.' }])
})

test('model replies remain untrusted; the port never authorizes or normalizes them', async () => {
  const untrusted = { action: 'write', postId: 10, approved: true }
  const invoke = createModelInvoker({ generate: () => untrusted })
  assert.equal(await invoke('synthetic'), untrusted)
  const invalid = createModelInvoker({ generate: () => 'malformed text' })
  assert.equal(await invalid('synthetic'), 'malformed text')
})

test('host errors pass through unmodified and are never retried', async () => {
  const marker = Object.assign(Error('isolation proof failed'), { code: 'NO_CREDENTIAL_PROOF' })
  let calls = 0
  const invoke = createModelInvoker({
    generate: async () => { calls++; throw marker },
  })
  await assert.rejects(invoke('synthetic'), error => error === marker)
  assert.equal(calls, 1)
})

test('no model invocation happens when a port is constructed or a wake chooses not to ask', () => {
  let calls = 0
  const invoke = createModelInvoker({ generate: () => { calls++; return { action: 'rest' } } })
  assert.equal(typeof invoke, 'function')
  assert.equal(calls, 0)
})

test('invalid ports and non-string prompts fail closed', () => {
  for (const port of [null, false, {}, [], { generate: true }, () => 'not-port']) {
    assert.throws(() => createModelInvoker(port), /model port/)
  }
  assert.throws(() => legacyModelPort(null), /host model/)
  const invoke = createModelInvoker({ generate: () => 'synthetic' })
  assert.throws(() => invoke({ prompt: 'synthetic' }), /prompt must/)
})

test('legacy function adapters retain exactly the original invocation and return type', async () => {
  const calls = []
  const oldModel = async prompt => {
    calls.push(prompt)
    return { action: 'rest' }
  }
  const port = legacyModelPort(oldModel)
  assert.equal(Object.isFrozen(port), true)
  const invoke = createModelInvoker(port)
  assert.deepEqual(await invoke('unaltered'), { action: 'rest' })
  assert.deepEqual(calls, ['unaltered'])
})

test('real cognition budget and one invalid-reply retry stay with the existing controller', async () => {
  const prompts = []
  const port = {
    generate: async ({ prompt }) => {
      prompts.push(prompt)
      return prompts.length === 1 ? null : { action: 'rest' }
    },
  }
  const invoker = createModelInvoker(port)
  class InvalidModelReply extends Error {}
  const controller = createCognitionControl({
    model: invoker,
    parseReply: reply => {
      if (!reply?.action) throw new InvalidModelReply('invalid reply')
      return reply
    },
    invalidReason: e => e instanceof InvalidModelReply ? 'invalid' : null,
    invalidActionError: () => new InvalidModelReply('disallowed'),
    retryNote: '\nRETRY',
  })
  assert.deepEqual(await controller.decide('SYNTHETIC'), { action: 'rest' })
  assert.deepEqual(prompts, ['SYNTHETIC', 'SYNTHETIC\nRETRY'])
  assert.deepEqual(controller.snapshot(), { modelCalls: 2, explored: 0, invalidReplies: 1 })
})
