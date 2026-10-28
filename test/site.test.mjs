import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8')

test('website is a self-contained HTML page with valid inline JavaScript', () => {
  assert.match(html, /<!doctype html>/i)
  assert.match(html, /<meta name="viewport"/)
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1)
  assert.doesNotThrow(() => new Script(scripts[0][1]))
  assert.doesNotMatch(html, /<script[^>]*src=/)
})

test('anatomy nodes and accessible controls correspond to all six mechanisms', () => {
  const parts = ['identity', 'attention', 'memory', 'thought', 'policy', 'rest']
  for (const part of parts) {
    assert.match(html, new RegExp('data-part="'+part+'"'))
    assert.match(html, new RegExp('(?:identity|attention|memory|thought|policy|rest):\\s*\\{'))
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1])
  assert.equal(new Set(ids).size, ids.length, 'HTML ids must be unique')
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(target), 'Missing anchor target: '+target)
  }
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /prefers-reduced-motion/)
})

test('browser demo explicitly discloses that it is not a model', () => {
  assert.match(html, /DETERMINISTIC BROWSER SIMULATION · NO LLM/)
  assert.match(html, /No network request, post, or real action occurred/)
  assert.match(html, /Node.js 22\+/)
  assert.match(html, /npm run demo:cat/)
})
