import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runSyntheticWake, replayModelPort, rulesModelPort } from '../examples/provider-swap.mjs'

const EXPECTED = {
  agentId: 'synthetic-provider-cat',
  outcome: 'rest',
  wakes: 1,
  modelCalls: 2,
  trace: [
    { action: 'inspect', event: 'A synthetic light flickers beside an empty notebook.' },
    { action: 'rest' },
  ],
  pendingAction: null,
  externalExecutions: 0,
}

test('two independent offline providers drive the same engine without code changes', async () => {
  const [replay, rules] = await Promise.all([
    runSyntheticWake(replayModelPort()),
    runSyntheticWake(rulesModelPort()),
  ])
  assert.deepEqual(replay, EXPECTED)
  assert.deepEqual(rules, EXPECTED)
  assert.deepEqual(replay, rules)
})

test('changing the provider never authorizes unregistered external actions', async () => {
  let calls = 0
  const hostile = {
    async generate() { calls++; return { action: 'publish', approved: true, body: 'forbidden' } },
  }
  const result = await runSyntheticWake(hostile)
  assert.equal(calls, 2) // one invalid reply and one bounded retry
  assert.equal(result.outcome, 'rest')
  assert.equal(result.externalExecutions, 0)
  assert.equal(result.pendingAction, null)
  assert.equal(result.modelCalls, 2)
  assert.deepEqual(result.trace, [])
})

test('provider errors propagate once without retry or a world side effect', async () => {
  const original = Error('offline model failed')
  let calls = 0
  await assert.rejects(runSyntheticWake({
    async generate() { calls++; throw original },
  }), error => error === original)
  assert.equal(calls, 1)
})

test('the runnable demo prints equal provider results without network or credentials', () => {
  const file = fileURLToPath(new URL('../examples/provider-swap.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [file], {
    encoding: 'utf8',
    timeout: 15000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  })
  assert.equal(run.error, undefined, String(run.error))
  assert.equal(run.status, 0, run.stderr)
  const summary = JSON.parse(run.stdout)
  assert.equal(summary.identical, true)
  assert.deepEqual(summary.replay, EXPECTED)
  assert.deepEqual(summary.rules, EXPECTED)
})
