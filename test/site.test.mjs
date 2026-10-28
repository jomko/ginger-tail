import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8')

test('production website links local assets and its JavaScript parses', () => {
  assert.match(page, /<!doctype html>/i)
  assert.match(page, /<meta name="viewport"/)
  assert.match(page, /<script type="module" src="\/ginger-tail\/_astro\/[^\"]+\.js"><\/script>/)
  assert.match(page, /<link rel="stylesheet" href="\/ginger-tail\/_astro\/[^\"]+\.css">/)
  const [, scriptPath] = page.match(/<script type="module" src="\/ginger-tail\/_astro\/([^\"]+\.js)"><\/script>/) ?? []
  assert.ok(scriptPath, 'production JavaScript bundle is linked')
  const bundle = readFileSync(new URL(`../docs/_astro/${scriptPath}`, import.meta.url), 'utf8')
  assert.doesNotThrow(() => new Script(bundle))
  assert.match(bundle, /prefers-reduced-motion/)
  const [, stylePath] = page.match(/<link rel="stylesheet" href="\/ginger-tail\/_astro\/([^\"]+\.css)">/) ?? []
  assert.ok(stylePath, 'production stylesheet is linked')
  assert.match(readFileSync(new URL(`../docs/_astro/${stylePath}`, import.meta.url), 'utf8'), /prefers-reduced-motion/)
  assert.match(page, /https:\/\/jomko\.github\.io\/ginger-tail\/og\.jpg/)
  assert.match(page, /summary_large_image/)
})

test('the main three parts and two-wake explanation remain', () => {
  assert.match(page, /The tail/)
  assert.match(page, /wags the cat/)
  for (const role of ['llm','cat','tail']) assert.match(page, new RegExp(`data-layer="${role}"`))
  for (const step of ['morning','bird','model-one','memory','night','morning-two']) {
    assert.match(page, new RegExp(`data-step="${step}"`))
  }
  assert.match(page, /window\/bird-01/)
  assert.match(page, /SCRIPTED MODEL CALL · NO LIVE LLM/)
  assert.match(page, /trusted host saves the sourced observation/)
  assert.match(page, /Different model call\. Same cat\. Continuing history\./)
})

test('interactive controls and anchors are keyboard accessible and unambiguous', () => {
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1])
  assert.equal(new Set(ids).size, ids.length)
  for (const [, id] of page.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(id), `missing anchor #${id}`)
  }
  assert.match(page, /aria-live="polite"/)
  assert.match(page, /class="skip-link"/)
  assert.match(page, /aria-pressed="true"/)
  assert.match(page, /<details class="mochi-details">/)
  assert.match(page, /MIT/)
})
