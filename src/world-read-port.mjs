// Read-only world adapter used by resident cognition.
// The host owns the resource allowlist, source verification, transport,
// credentials, retries/timeouts and any state mutation or action executor.
// This module cannot grant authority to perform external actions.
export function createWorldReader(port) {
  if (!port || typeof port !== 'object' || Array.isArray(port) ||
      typeof port.read !== 'function') {
    throw new TypeError('A world read port with read({ operation, input }) is required')
  }
  return function readWorld(operation, input) {
    if (typeof operation !== 'string' || !operation ||
        operation.length > 180 || /[\u0000-\u001f\u007f]/.test(operation)) {
      throw new TypeError('World operation must be a bounded nonempty string')
    }
    // The result is untrusted world data. Do not decode, approve, cache,
    // recover, retry or construct an action from it here.
    return port.read({ operation, input })
  }
}

/** Compatibility with a host's existing (operation, input) read function. */
export function legacyWorldReadPort(read) {
  if (typeof read !== 'function') throw new TypeError('A trusted host read function is required')
  return Object.freeze({
    read({ operation, input }) { return read(operation, input) },
  })
}
