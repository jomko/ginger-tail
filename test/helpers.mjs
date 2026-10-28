// Shared helpers for lock, reconciliation and durability tests. Isolated
// temporary directories only; no network and no real external writes.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs, { mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const identity = { id: 'synthetic-cat' }
export const linuxOnly = existsSync('/proc/sys/kernel/random/boot_id') ? false : 'requires Linux /proc'
const worker = fileURLToPath(new URL('./fixtures/wake-worker.mjs', import.meta.url))
const killer = new URL('./fixtures/kill-at-rename.mjs', import.meta.url).href

export async function sandbox(callback) {
  const root = await mkdtemp(join(tmpdir(), 'ginger-tail-reliability-'))
  const directory = join(root, 'state')
  const effects = join(root, 'effects.log')
  try { return await callback({ root, directory, effects }) }
  finally { await rm(root, { recursive: true, force: true }) }
}

export async function effectLines(effects) {
  try { return (await readFile(effects, 'utf8')).split('\n').filter(Boolean) } catch { return [] }
}

// Starts a worker; resolves `ready` with its first reported line and
// `exit` with { code, signal, results } once it terminates.
export function startWorker(...args) {
  return startWorkerWith({}, ...args)
}

// `options.kill` preloads the rename killer (fixtures/kill-at-rename.mjs),
// e.g. { kill: 'after:2' }.
export function startWorkerWith(options, ...args) {
  const preload = options.kill ? ['--import', killer] : []
  const child = spawn(process.execPath, [...preload, worker, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(options.kill && { GT_KILL_AT_RENAME: options.kill }) },
  })
  let output = ''
  let onLine
  const ready = new Promise(resolve => { onLine = resolve })
  child.stdout.on('data', chunk => {
    output += chunk
    if (output.includes('\n')) onLine(JSON.parse(output.split('\n')[0]))
  })
  const exit = new Promise(resolve => child.on('exit', (code, signal) => resolve({
    code, signal, results: output.split('\n').filter(Boolean).map(line => JSON.parse(line)),
  })))
  return { child, ready, exit }
}

export async function runWorker(...args) {
  return startWorker(...args).exit
}

export async function runWorkerWith(options, ...args) {
  return startWorkerWith(options, ...args).exit
}

// Lock metadata exactly as a process on THIS host and boot would write it.
export async function plantLock(directory, overrides = {}) {
  return plantOwner(join(directory, 'wake.lock'), overrides)
}

// Any owner record: a lock or a recovery claim.
export async function plantOwner(file, overrides = {}) {
  const read = path => readFile(path, 'utf8').then(text => text.trim()).catch(() => null)
  const stat = await readFile(`/proc/${process.pid}/stat`, 'utf8')
  const owner = {
    version: 1, token: randomUUID(), hostname: hostname(),
    machineId: await read('/etc/machine-id'), bootId: await read('/proc/sys/kernel/random/boot_id'),
    pidNamespace: await readlink('/proc/self/ns/pid'), pid: process.pid,
    processStart: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
    acquiredAt: '2026-01-01T00:00:00.000Z', ...overrides,
  }
  await writeFile(file, JSON.stringify(owner) + '\n', { mode: 0o600 })
  return owner
}

// A PID that belonged to a process which has exited.
export async function deadPid() {
  const child = spawn(process.execPath, ['-e', ''])
  await new Promise(resolve => child.on('exit', resolve))
  return child.pid
}

// ---- Filesystem fault injection (patches the shared node:fs/promises object;
// use t.mock so it is restored after the test).
const realOpen = fs.open
export const injected = code => Object.assign(new Error('injected ' + code), { code })
export const isTemporary = path => /\.state-[0-9a-f-]{36}\.tmp$/.test(String(path))

// Crash-consistency model of one state directory. A rename is visible at
// once but survives `powerLoss()` only after a LATER successful directory
// fsync. Temporary file data is fsynced before rename, so file contents are
// modelled as durable. `fail({ dirSync, tmpOpen })` queues per-call faults:
// each `true` fails the next call of that kind; later calls succeed.
export function faultyDisk(t, directory) {
  const file = join(directory, 'state.json')
  const queue = { dirSync: [], tmpOpen: [] }
  let durable = null
  t.mock.method(fs, 'open', async (path, ...rest) => {
    if (isTemporary(path) && queue.tmpOpen.shift()) throw injected('ENOSPC')
    const handle = await realOpen(path, ...rest)
    if (path === directory) {
      const sync = handle.sync.bind(handle)
      handle.sync = async () => {
        if (queue.dirSync.shift()) throw injected('EIO')
        await sync()
        durable = await readFile(file, 'utf8').catch(() => null)
      }
    }
    return handle
  })
  return {
    fail({ dirSync = [], tmpOpen = [] } = {}) { queue.dirSync = [...dirSync]; queue.tmpOpen = [...tmpOpen] },
    failForever() { queue.dirSync = Array(1000).fill(true) },
    heal() { queue.dirSync = []; queue.tmpOpen = [] },
    async powerLoss() {
      if (durable === null) await rm(file, { force: true })
      else await writeFile(file, durable)
    },
  }
}
