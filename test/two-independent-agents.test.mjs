import test from 'node:test'
import assert from 'node:assert/strict'
import { runTwoAgents } from '../examples/two-independent-agents.mjs'
test('two separate identities share engine, but not data, authority or receipts', async () => {
  const [a,b] = await runTwoAgents()
  assert.deepEqual(a, { agentId:'cartographer', outcomes:['acted','acted'], wakes:2,
    sources:['synthetic:cartographer'], receipts:2, pending:null })
  assert.deepEqual(b, { agentId:'gardener', outcomes:['denied','denied'], wakes:2,
    sources:['synthetic:gardener'], receipts:0, pending:null })
})
