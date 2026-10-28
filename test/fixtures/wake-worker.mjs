// Child process for lock and crash tests. Every external effect is a line
// appended to a local synthetic log; nothing leaves the temporary directory.
import { appendFile, open, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { createFileStore, runWake } from '../../src/index.mjs'

const [directory, mode, effects, extra] = process.argv.slice(2)
// `node --test` also loads this file directly; without arguments it does nothing.
if (!directory) process.exit(0)
const identity = { id: 'synthetic-cat' }
const store = createFileStore({ directory, agentId: identity.id })
const report = value => process.stdout.write(JSON.stringify(value) + '\n')

try {
  if (mode === 'hold') {
    setInterval(() => {}, 1000)
    await store.withLock(() => { report({ locked: process.pid }); return new Promise(() => {}) })
  } else if (mode === 'contend') {
    // `extra` is a marker path: creating it exclusively proves nobody else
    // is inside the critical section at the same time.
    report(await runWake({ identity, store, world: { observe: () => ({}) }, decide: async () => {
      let marker
      try { marker = await open(extra, 'wx') } catch { await appendFile(effects, 'OVERLAP\n') }
      await sleep(150)
      await marker?.close()
      await rm(extra, { force: true })
      return { kind: 'rest' }
    } }))
  } else if (mode === 'action') {
    report(await runWake({
      identity, store, authorize: async () => true,
      world: {
        observe: () => ({}),
        execute: async ({ actionId }) => {
          if (extra === 'crash-before-execute') process.kill(process.pid, 'SIGKILL')
          await appendFile(effects, actionId + '\n')
          if (extra === 'crash-after-execute') process.kill(process.pid, 'SIGKILL')
          return { status: 'confirmed', receiptId: 'receipt-' + actionId }
        },
      },
      decide: async () => ({ kind: 'action', action: { kind: 'note', payload: {} } }),
    }))
  } else {
    throw new Error('Unknown worker mode')
  }
} catch (error) {
  report({ error: error.code ?? error.name, reason: error.lock?.reason })
}
