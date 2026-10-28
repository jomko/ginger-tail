import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8')

test('website is fully self-contained and its JavaScript parses', () => {
  assert.match(page, /<!doctype html>/i)
  assert.match(page, /<meta name="viewport"/)
  const script = page.match(/<script>([\s\S]+?)<\/script>/)
  assert.ok(script, 'inline script is present')
  assert.doesNotThrow(() => new Script(script[1]))
  assert.doesNotMatch(page, /<script[^>]+src=/)
  assert.match(page, /data:image\/webp;base64,/)
  assert.match(page, /prefers-reduced-motion/)
})

test('the main three parts and two-wake explanation remain', () => {
  assert.match(page, /The tail/)
  assert.match(page, /wags the cat/)
  for (const role of ['model','cat','tail']) {
    assert.match(page, new RegExp('data-role="'+role+'"'))
    assert.match(page, new RegExp('(?:^|[,\\s])'+role+':\\{'))
  }
  for (const id of ['wake','reset','day-one','day-two','model-state','tail-state','host-state']) {
    assert.match(page, new RegExp('id="'+id+'"'))
  }
  assert.match(page, /window\/bird-01/)
  assert.match(page, /window\/bird-02/)
  assert.match(page, /No model calls or external actions/)
  assert.doesNotMatch(page, /id="motion"|Pause motion|The model thinks\. The cat stays\./)
  assert.match(page, /\.hero \.stage\{width:100vi/)
  assert.match(page, /mask-image:linear-gradient\(to bottom/)
})

test('interactive controls and anchors are keyboard accessible and unambiguous', () => {
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1])
  assert.equal(new Set(ids).size, ids.length)
  for (const [, id] of page.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(id), `missing anchor #${id}`)
  }
  assert.match(page, /aria-live="polite"/)
  assert.match(page, /:focus-visible/)
  assert.match(page, /<details>/)
  assert.match(page, /MIT/)
})
