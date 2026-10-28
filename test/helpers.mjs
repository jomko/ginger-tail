// Shared helpers for lock, reconciliation and durability tests. Isolated
// temporary directories only; no network and no real external writes.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const identity = { id: 'synthetic-cat' }
export const linuxOnly = existsSync('/proc/sys/kernel/random/boot_id') ? false : 'requires Linux /proc'
const worker = fileURLToPath(new URL('./fixtures/wake-worker.mjs', import.meta.url))

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
  const child = spawn(process.execPath, [worker, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
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

// Lock metadata exactly as a process on THIS host and boot would write it.
export async function plantLock(directory, overrides = {}) {
  const read = path => readFile(path, 'utf8').then(text => text.trim()).catch(() => null)
  const stat = await readFile(`/proc/${process.pid}/stat`, 'utf8')
  const owner = {
    version: 1, token: randomUUID(), hostname: hostname(),
    machineId: await read('/etc/machine-id'), bootId: await read('/proc/sys/kernel/random/boot_id'),
    pidNamespace: await readlink('/proc/self/ns/pid'), pid: process.pid,
    processStart: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
    acquiredAt: '2026-01-01T00:00:00.000Z', ...overrides,
  }
  await writeFile(join(directory, 'wake.lock'), JSON.stringify(owner) + '\n', { mode: 0o600 })
  return owner
}

// A PID that belonged to a process which has exited.
export async function deadPid() {
  const child = spawn(process.execPath, ['-e', ''])
  await new Promise(resolve => child.on('exit', resolve))
  return child.pid
}
