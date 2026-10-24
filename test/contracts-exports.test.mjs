import test from 'node:test'
import assert from 'node:assert/strict'
import * as direct from '../src/contracts.mjs'
import * as published from 'ginger-tail/contracts'
import * as root from 'ginger-tail'

test('published v1 contract and root exports resolve to the one implementation', () => {
  for (const key of ['WAKE_CONTRACT_VERSION', 'MAX_ACTION_BYTES', 'MAX_OBSERVATION_BYTES',
    'assertAgentIdentity', 'assertWakePorts', 'parseWakeDecision',
    'assertBoundedObservation', 'isConfirmedActionReceipt']) {
    assert.equal(published[key], direct[key], key)
    assert.equal(root[key], direct[key], key)
  }
  assert.equal(typeof root.runWake, 'function')
  assert.equal(typeof root.createFileStore, 'function')
})
