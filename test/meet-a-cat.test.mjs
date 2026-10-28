import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

const script = resolve('examples/meet-a-cat.mjs')

function run(directory, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CAT_MODEL: '', GINGER_TAIL_CAT_DIR: directory },
    timeout: 10000,
  })
}

test('Mochi remembers a conversation across processes and may rest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ginger-tail-mochi-'))
  try {
    const first = run(directory, 'My name is Ada')
    assert.equal(first.status, 0, first.stderr)
    assert.match(first.stdout, /Mochi: Meow/)

    const second = run(directory, 'What do you remember?')
    assert.equal(second.status, 0, second.stderr)
    assert.match(second.stdout, /Last time you said: "My name is Ada"/)

    const historyFile = join(directory, 'conversation.json')
    const before = readFileSync(historyFile, 'utf8')
    const sleep = run(directory, '/sleep')
    assert.equal(sleep.status, 0, sleep.stderr)
    assert.match(sleep.stdout, /Zzz/)
    assert.equal(readFileSync(historyFile, 'utf8'), before)

    const state = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8'))
    assert.equal(state.wakes, 3)
    assert.equal(state.pendingAction, null)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('invalid cat transcript is rejected rather than silently erased', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ginger-tail-mochi-'))
  try {
    const first = run(directory, 'Hello')
    assert.equal(first.status, 0, first.stderr)
    const historyFile = join(directory, 'conversation.json')
    writeFileSync(historyFile, '{bad json')
    const second = run(directory, 'Remember?')
    assert.notEqual(second.status, 0)
    assert.match(second.stderr, /could not finish the wake/)
    assert.equal(readFileSync(historyFile, 'utf8'), '{bad json')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
