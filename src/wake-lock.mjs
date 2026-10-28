import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

// Crash-safe single-host wake lock. Node has no portable OS file lock, so
// this is a metadata lock built from atomic primitives:
//   - acquisition: link(2) of a fully written owner file; EEXIST means held;
//   - ownership: host, kernel boot, PID namespace, PID and process start time;
//   - recovery: only a PROVABLY dead owner's lock is removed, under an
//     exclusive per-token recovery claim, after re-reading the token.
// Anything that cannot be proven (another host, another namespace, an
// unreadable or legacy lock, a non-Linux host) fails closed and is left in place.
// There is deliberately no time-based lease: a slow living owner keeps its lock.

const LOCK_VERSION = 1
const MAX_ACQUIRE_ATTEMPTS = 3
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class WakeLockError extends Error {
  constructor(diagnostics) {
    super(`Wake already locked (${diagnostics.reason}); manual inspection required`)
    this.name = 'WakeLockError'
    this.code = 'WAKE_LOCKED'
    this.lock = diagnostics
  }
}

async function readText(path) {
  try { return (await fs.readFile(path, 'utf8')).trim().slice(0, 128) || null } catch { return null }
}

// Linux /proc/<pid>/stat: fields after the last ')' start at field 3 (state);
// field 22 (starttime, clock ticks since boot) is index 19.
async function processStat(pid) {
  let raw
  try { raw = await fs.readFile(`/proc/${pid}/stat`, 'utf8') } catch { return null }
  const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
  return fields.length > 19 ? { state: fields[0], start: fields[19] } : null
}

let currentIdentity
function currentProcess() {
  currentIdentity ??= (async () => ({
    hostname: hostname().slice(0, 128),
    machineId: await readText('/etc/machine-id'),
    bootId: await readText('/proc/sys/kernel/random/boot_id'),
    pidNamespace: await fs.readlink('/proc/self/ns/pid').catch(() => null),
    pid: process.pid,
    processStart: (await processStat(process.pid))?.start ?? null,
  }))()
  return currentIdentity
}

function optionalText(value) {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 128)
}

function parseOwner(raw) {
  let owner
  try { owner = JSON.parse(raw) } catch { return null }
  if (!owner || typeof owner !== 'object' || owner.version !== LOCK_VERSION ||
      typeof owner.token !== 'string' || !TOKEN.test(owner.token) ||
      !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.hostname !== 'string' || !optionalText(owner.hostname) ||
      !optionalText(owner.machineId) || !optionalText(owner.bootId) ||
      !optionalText(owner.pidNamespace) || !optionalText(owner.processStart) ||
      typeof owner.acquiredAt !== 'string' || owner.acquiredAt.length > 64) return null
  return owner
}

function processExists(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

async function classify(owner, self) {
  if (owner.hostname !== self.hostname) return { status: 'uncertain', reason: 'different_host' }
  if (!owner.bootId || !self.bootId) return { status: 'uncertain', reason: 'unverifiable_platform' }
  if (owner.bootId !== self.bootId) {
    // The owner's kernel boot has ended, so the owner is dead, but only if
    // this is provably the same machine. A cloned machine id is out of contract.
    return owner.machineId && owner.machineId === self.machineId
      ? { status: 'stale', reason: 'owner_boot_ended' }
      : { status: 'uncertain', reason: 'different_boot' }
  }
  if (!owner.pidNamespace || owner.pidNamespace !== self.pidNamespace) {
    return { status: 'uncertain', reason: 'different_pid_namespace' }
  }
  if (!processExists(owner.pid)) return { status: 'stale', reason: 'owner_exited' }
  const stat = await processStat(owner.pid)
  // Unreadable /proc (e.g. hidepid) or an owner without a start time: the
  // PID exists, so we cannot rule out the owner. Fail closed.
  if (!stat || !owner.processStart) return { status: 'live', reason: 'owner_unverifiable' }
  if (stat.start !== owner.processStart) return { status: 'stale', reason: 'pid_reused' }
  if (stat.state === 'Z') return { status: 'stale', reason: 'owner_exited' }
  return { status: 'live', reason: 'owner_running' }
}

async function readLock(path) {
  try { return await fs.readFile(path, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function inspectWakeLock(path) {
  const raw = await readLock(path)
  if (raw === null) return { status: 'free', path }
  const owner = parseOwner(raw)
  if (!owner) return { status: 'uncertain', reason: 'unreadable_lock_metadata', path }
  const verdict = await classify(owner, await currentProcess())
  return { ...verdict, path, owner: { token: owner.token, pid: owner.pid,
                                      hostname: owner.hostname, acquiredAt: owner.acquiredAt } }
}

// Removes a lock only if it still carries the stale token. The claim is
// exclusive per token, so no second recoverer can delete a lock that
// was re-acquired after this one removed the stale file.
async function recover(path, staleToken, draft) {
  const claim = `${path}.recover-${staleToken}`
  try { await fs.link(draft, claim) } catch (error) {
    if (error.code === 'EEXIST') {
      throw new WakeLockError({ status: 'uncertain', reason: 'recovery_in_progress', path, claim })
    }
    throw error
  }
  try {
    const raw = await readLock(path)
    if (raw !== null && parseOwner(raw)?.token === staleToken) await fs.unlink(path)
  } finally {
    await fs.unlink(claim)
  }
}

export async function acquireWakeLock(path) {
  const self = await currentProcess()
  const token = randomUUID()
  const draft = `${path}-${token}.tmp`
  const owner = { version: LOCK_VERSION, token, ...self, acquiredAt: new Date().toISOString() }
  await fs.writeFile(draft, JSON.stringify(owner) + '\n', { flag: 'wx', mode: 0o600 })
  try {
    for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
      try {
        await fs.link(draft, path)
        return { path, token }
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      const found = await inspectWakeLock(path)
      if (found.status === 'free') continue
      if (found.status !== 'stale') throw new WakeLockError(found)
      await recover(path, found.owner.token, draft)
      process.emitWarning(`Recovered stale wake lock held by pid ${found.owner.pid} ` +
        `since ${found.owner.acquiredAt} (${found.reason})`, { code: 'GINGER_TAIL_STALE_LOCK' })
    }
    throw new WakeLockError({ status: 'uncertain', reason: 'contention', path })
  } finally {
    await fs.rm(draft, { force: true })
  }
}

// Never deletes a lock this holder does not own.
export async function releaseWakeLock({ path, token }) {
  const raw = await readLock(path)
  if (raw === null || parseOwner(raw)?.token !== token) {
    process.emitWarning(`Wake lock ${path} was not held by this wake at release`,
      { code: 'GINGER_TAIL_LOCK_LOST' })
    return
  }
  await fs.unlink(path)
}
