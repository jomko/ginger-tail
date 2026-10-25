// Trusted, already-authorized external-effect boundary for resident hosts.
// No model decision is authorization. The embedding host must complete all
// evidence, policy, feature-flag and per-wake gates BEFORE invoking this port.
// The port never stores credentials, chooses effects, retries or interprets receipts.
export function createTrustedActionInvoker(port) {
  if (!port || typeof port !== 'object' || Array.isArray(port) ||
      typeof port.execute !== 'function') {
    throw new TypeError('A trusted action port with execute({ action }) is required')
  }
  return function executeTrustedAction(action) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new TypeError('Trusted action must be a non-array object')
    }
    // This payload is opaque: the private host owns meaning and authority.
    // Neither input nor output is validated as approval by this module.
    return port.execute({ action })
  }
}

/** Compatibility with an already-trusted, function-shaped host executor. */
export function legacyTrustedActionPort(send) {
  if (typeof send !== 'function') {
    throw new TypeError('A trusted host action sender is required')
  }
  return Object.freeze({
    execute({ action }) { return send(action) },
  })
}
