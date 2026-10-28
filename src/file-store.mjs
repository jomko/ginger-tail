import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { acquireWakeLock, inspectWakeLock, releaseWakeLock } from './wake-lock.mjs'

export { WakeLockError } from './wake-lock.mjs'

const MAX_RECONCILIATIONS = 100
const UNSUPPORTED_SYNC = new Set(['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM', 'EBADF'])

// A state change that cannot be confirmed durable. The new state may or may
// not be visible on disk; callers must treat the write as uncertain.
export class StateDurabilityError extends Error {
  constructor(path, cause) {
    const unsupported = UNSUPPORTED_SYNC.has(cause?.code)
    super(unsupported
      ? `Directory fsync is not supported for ${path}; refusing to claim durable state`
      : `Directory fsync failed for ${path}`, { cause })
    this.name = 'StateDurabilityError'
    this.code = 'STATE_DURABILITY_UNCONFIRMED'
    this.unsupported = unsupported
  }
}

export function emptyState(agentId) {
  return { version: 1, agentId, wakes: 0, lastOutcome: null, pendingAction: null, lastReceipt: null }
}

function boundedText(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function validPendingAction(value) {
  return value === null || (typeof value === 'object' && !Array.isArray(value) &&
    ['pending', 'uncertain'].includes(value.status) && boundedText(value.id, 128) &&
    (value.receipt === undefined || boundedText(value.receipt?.receiptId, 200)))
}

function validReconciliations(value) {
  return value === undefined || (Array.isArray(value) && value.length <= MAX_RECONCILIATIONS &&
    value.every(entry => entry && typeof entry === 'object' && boundedText(entry.actionId, 128) &&
      ['confirmed', 'not-executed', 'unresolved'].includes(entry.resolution)))
}

function validateState(value, agentId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.version !== 1 || value.agentId !== agentId ||
      !Number.isSafeInteger(value.wakes) || value.wakes < 0 ||
      !validPendingAction(value.pendingAction) ||
      !validReconciliations(value.reconciliations)) {
    throw new Error('Invalid or incompatible agent state; refusing to reset it')
  }
  return value
}

// Makes a completed rename (or a newly created entry) durable.
async function syncDirectory(path) {
  let handle
  try {
    handle = await fs.open(path, 'r')
    await handle.sync()
  } catch (error) {
    throw new StateDurabilityError(path, error)
  } finally {
    await handle?.close().catch(() => {})
  }
}

// Local single-host store. A lock is removed automatically only when its
// owner is provably dead; see wake-lock.mjs.
export function createFileStore({ directory, agentId }) {
  if (typeof directory !== 'string' || !directory ||
      typeof agentId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(agentId)) {
    throw new TypeError('A directory and safe agentId are required')
  }
  const root = resolve(directory)
  const file = join(root, 'state.json')
  const lock = join(root, 'wake.lock')

  async function ensureDirectory() {
    const created = await fs.mkdir(root, { recursive: true, mode: 0o700 })
    // Each newly created directory entry lives in its parent.
    for (let entry = root; created; entry = dirname(entry)) {
      await syncDirectory(dirname(entry))
      if (entry === created || entry === dirname(entry)) break
    }
  }

  return {
    async withLock(callback) {
      await ensureDirectory()
      const held = await acquireWakeLock(lock)
      try {
        // Only a lock holder writes state, so leftovers are from a crashed save.
        for (const name of await fs.readdir(root)) {
          if (/^\.state-[0-9a-f-]{36}\.tmp$/.test(name)) await fs.rm(join(root, name), { force: true })
        }
        return await callback()
      } finally {
        await releaseWakeLock(held)
      }
    },
    inspectLock() {
      return inspectWakeLock(lock)
    },
    async load() {
      let raw
      try {
        raw = await fs.readFile(file, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return emptyState(agentId)
        throw error
      }
      return validateState(JSON.parse(raw), agentId)
    },
    // Atomic and durable: write + fsync a temporary file, rename it over the
    // state file, then fsync the directory so the rename survives power loss.
    async save(state) {
      validateState(state, agentId)
      await ensureDirectory()
      const temporary = join(root, '.state-' + randomUUID() + '.tmp')
      const handle = await fs.open(temporary, 'wx', 0o600)
      try {
        try {
          await handle.writeFile(JSON.stringify(state, null, 2) + '\n', 'utf8')
          await handle.sync()
        } finally {
          await handle.close()
        }
        await fs.rename(temporary, file)
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => {})
        throw error
      }
      await syncDirectory(root)
    },
  }
}
