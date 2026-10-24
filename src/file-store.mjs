import { open, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export function emptyState(agentId) {
  return { version: 1, agentId, wakes: 0, lastOutcome: null, pendingAction: null, lastReceipt: null }
}

function validateState(value, agentId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.version !== 1 || value.agentId !== agentId ||
      !Number.isSafeInteger(value.wakes) || value.wakes < 0 ||
      !(value.pendingAction === null ||
        (typeof value.pendingAction === 'object' &&
          ['pending', 'uncertain'].includes(value.pendingAction.status) &&
          typeof value.pendingAction.id === 'string'))) {
    throw new Error('Invalid or incompatible agent state; refusing to reset it')
  }
  return value
}

// Local single-host store. An existing lock is never removed automatically.
export function createFileStore({ directory, agentId }) {
  if (typeof directory !== 'string' || !directory ||
      typeof agentId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(agentId)) {
    throw new TypeError('A directory and safe agentId are required')
  }
  const file = join(directory, 'state.json')
  const lock = join(directory, 'wake.lock')

  return {
    async withLock(callback) {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      let handle
      try {
        handle = await open(lock, 'wx', 0o600)
      } catch (error) {
        if (error.code === 'EEXIST') throw new Error('Wake already locked; manual inspection required')
        throw error
      }
      try {
        return await callback()
      } finally {
        try { await handle.close() } finally { await rm(lock) }
      }
    },
    async load() {
      let raw
      try {
        raw = await readFile(file, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return emptyState(agentId)
        throw error
      }
      return validateState(JSON.parse(raw), agentId)
    },
    async save(state) {
      validateState(state, agentId)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const temporary = join(directory, '.state-' + randomUUID() + '.tmp')
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(JSON.stringify(state, null, 2) + '\n', 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await rename(temporary, file)
      } catch (error) {
        await rm(temporary, { force: true })
        throw error
      }
    },
  }
}
