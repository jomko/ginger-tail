// Public v1 contracts for the existing offline wake.
// These helpers validate boundaries; they do not start a second resident loop.
export const WAKE_CONTRACT_VERSION = 1
export const MAX_ACTION_BYTES = 4096
export const MAX_OBSERVATION_BYTES = 16384

export function assertAgentIdentity(identity) {
  if (!identity || typeof identity.id !== 'string' || !identity.id.trim()) {
    throw new TypeError('Identity must contain a non-empty id')
  }
}

export function assertWakePorts({ store, world, decide, authorize } = {}) {
  if (!store || typeof store.withLock !== 'function' ||
      typeof store.load !== 'function' || typeof store.save !== 'function' ||
      typeof world?.observe !== 'function' || typeof decide !== 'function' ||
      typeof authorize !== 'function') {
    throw new TypeError('Missing runtime adapter')
  }
}

// A model decision is a proposal, never an authorization. Unknown actions
// cannot bypass the trusted policy or the authorized world executor.
export function parseWakeDecision(decision) {
  if (decision?.kind === 'rest') return { kind: 'rest' }
  if (decision?.kind !== 'action' || !decision.action ||
      typeof decision.action.kind !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(decision.action.kind) ||
      !decision.action.payload || typeof decision.action.payload !== 'object' ||
      Array.isArray(decision.action.payload)) {
    throw new TypeError('Invalid decision; expected rest or a bounded action proposal')
  }
  if (Buffer.byteLength(JSON.stringify(decision.action), 'utf8') > MAX_ACTION_BYTES) {
    throw new Error('Action proposal exceeds the 4 KiB limit')
  }
  return { kind: 'action', action: decision.action }
}

export function assertBoundedObservation(observation) {
  if (Buffer.byteLength(JSON.stringify(observation), 'utf8') > MAX_OBSERVATION_BYTES) {
    throw new Error('Observation exceeds the 16 KiB limit')
  }
}

export function isConfirmedActionReceipt(receipt) {
  return receipt?.status === 'confirmed' &&
    typeof receipt.receiptId === 'string' && !!receipt.receiptId &&
    receipt.receiptId.length <= 200
}
