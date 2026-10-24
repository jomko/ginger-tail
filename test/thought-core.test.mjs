import test from 'node:test'
import assert from 'node:assert/strict'
import { createThoughtCore, MAX_THOUGHTS } from '../src/thought-core.mjs'

const core = createThoughtCore({
  isSource: source => source === 'self' || /^source:[1-9][0-9]*$/.test(source),
  isSelfSource: source => source === 'self',
  formatSpark: thought => thought.source === 'self' ? 'Own observation' : thought.source,
  newId: () => '00000000-0000-4000-8000-000000000042',
})
const row = (source = 'self', status) => core.makeThought({
  source, thought: 'A synthetic unfinished observation.'
}, '2026-01-01T00:00:00Z', status)

test('requires trusted source policy', () => {
  assert.throws(() => createThoughtCore(), /Trusted source/)
})
test('self observation is valid and carries self provenance', () => {
  const x = row()
  assert.equal(x.evidenceStatus, 'self-observation')
  assert.equal(core.validThought(x), true)
  assert.equal(core.thoughtEvidenceStatus(x), 'self-observation')
})
test('external sources require explicit evidence', () => {
  assert.throws(() => row('source:42'), /missing thought evidence status/)
  assert.equal(core.validThought(row('source:42', 'partial')), true)
  assert.equal(core.validThought(row('source:42', 'complete')), true)
  assert.equal(core.validThought({ ...row(), source: 'unknown' }), false)
})
test('legacy sourced thoughts are never treated as confirmed', () => {
  const x = row('source:42', 'partial')
  delete x.evidenceStatus
  assert.equal(core.validThought(x), true)
  assert.equal(core.thoughtEvidenceStatus(x), 'legacy-unclassified')
})
test('duplicate IDs and invalid data fail closed', () => {
  const x = row()
  assert.throws(() => core.boundThoughts([x, x]), /duplicate thought ID/)
  assert.throws(() => core.boundThoughts([x, { ...x, id: 'bad-id' }]), /invalid thought store/)
  assert.equal(MAX_THOUGHTS, 32)
})
test('sharing requires a separate explicit reason', () => {
  const x = row()
  assert.throws(() => core.thoughtIntent(x, 'now'), /invalid thought sharing/)
  const intent = core.thoughtIntent(x, 'I want to share this observation today')
  assert.equal(intent.spark, 'Own observation')
  assert.equal(intent.point, x.text)
  assert.equal(intent.whyNow, 'I want to share this observation today')
})
