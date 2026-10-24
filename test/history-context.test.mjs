import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORY_BUDGET, READ_ITEM_BUDGET, SEARCH_ITEM_BUDGET,
  boundedReadItem, boundedSearchItem, renderHistory,
} from '../src/history-context.mjs'

test('default context budgets remain stable for Ginger compatibility', () => {
  assert.equal(HISTORY_BUDGET, 45000)
  assert.equal(READ_ITEM_BUDGET, 38000)
  assert.equal(SEARCH_ITEM_BUDGET, 22000)
})

test('a fully visible thread stays whole and is eligible for current-wake visibility', () => {
  const action = { action: 'read_post', postId: 42 }
  const post = { id: 42, title: 'Synthetic discussion', content: 'A synthetic observation.', comments: 1 }
  const reply = { id: 7, content: 'Synthetic reply.', answers: [] }
  const { item, shownComments } = boundedReadItem(action, { post, comments: [reply] })
  assert.deepEqual(shownComments, [reply])
  assert.equal('truncated' in item, false)
  assert.deepEqual(JSON.parse(item.result), { post, comments: [reply] })
  const displayed = renderHistory([item])
  assert.ok(displayed.visible.has(item))
  assert.deepEqual(JSON.parse(displayed.text), [item])
})

test('truncated thread returns a structurally valid prefix with an explicit marker', () => {
  const action = { action: 'read_post', postId: 42 }
  const post = { id: 42, title: 'Synthetic discussion', content: 'short', comments: 2 }
  const comments = [
    { id: 1, content: 'First comment.', answers: [] },
    { id: 2, content: 'Second comment '.repeat(400), answers: [] },
  ]
  const { item, shownComments } = boundedReadItem(action, { post, comments }, { budget: 550 })
  assert.ok(item.truncated)
  assert.equal(item.truncated.totalComments, 2)
  assert.deepEqual(JSON.parse(item.result).comments, shownComments)
  assert.ok(shownComments.length < 2)
  assert.ok(JSON.stringify(item).length <= 550)
})

test('oversized post content is cut inside valid JSON, never presented as a whole post', () => {
  const action = { action: 'read_post', postId: 7 }
  const post = { id: 7, content: 'A'.repeat(8000), comments: 0 }
  const { item } = boundedReadItem(action, { post, comments: [] }, { budget: 600 })
  assert.equal(item.truncated.postContentCut, true)
  assert.equal(item.truncated.shownComments, 0)
  assert.ok(JSON.stringify(item).length <= 600)
  assert.ok(JSON.parse(item.result).post.content.length < post.content.length)
})

test('bounded search output retains original order and a truncation marker', () => {
  const payload = { results: [
    { id: 1, title: 'First result' },
    { id: 2, title: 'Second result '.repeat(150) },
  ], total: 2 }
  const result = boundedSearchItem({ action: 'search', term: 'synthetic' }, payload, 1, { budget: 400 })
  assert.ok(result.truncated)
  assert.equal(result.truncated.totalResults, 2)
  assert.ok(JSON.stringify(result).length <= 400)
  assert.equal(JSON.parse(result.result).results[0]?.id, 1)
})

test('context rendering does not pretend omitted or stubbed items were shown in full', () => {
  const old = { action: { action: 'read_post', postId: 1 }, title: 'Older synthetic post', result: 'x'.repeat(1500) }
  const current = { action: { action: 'read_post', postId: 2 }, title: 'Current synthetic post', result: 'Visible text' }
  const result = renderHistory([old, current], 420)
  assert.ok(result.visible.has(current))
  assert.equal(result.visible.has(old), false)
  const shown = JSON.parse(result.text)
  assert.ok(shown.some(row => row.omitted === 'context-budget' || row.omittedEarlierSteps))
  assert.ok(JSON.stringify(result.text).length > 0)
})

test('history renderer is deterministic and does not mutate caller arrays', () => {
  const steps = [{ action: 'rest' }, { action: 'read', result: 'Synthetic' }]
  const before = structuredClone(steps)
  const one = renderHistory(steps)
  const two = renderHistory(steps)
  assert.equal(one.text, two.text)
  assert.deepEqual(steps, before)
  assert.equal(one.visible.size, 2)
})
