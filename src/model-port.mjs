// Host-owned model boundary. A model reply is untrusted data, not an action
// or a permission. Authentication, sandbox isolation, credential proving,
// deadlines and output parsing remain the host adapter's responsibility.
//
// No model is created or called until the returned invoker is invoked.
export function createModelInvoker(port) {
  if (!port || typeof port !== 'object' || Array.isArray(port) ||
      typeof port.generate !== 'function') {
    throw new TypeError('A model port with generate({ prompt }) is required')
  }
  return function invokeModel(prompt) {
    if (typeof prompt !== 'string') throw new TypeError('Model prompt must be a string')
    // Deliberately do not catch, retry, transform or interpret the reply.
    // The existing cognition controller alone accounts for every model turn.
    return port.generate({ prompt })
  }
}

/** Compatibility bridge for already trusted, function-shaped host adapters. */
export function legacyModelPort(turn) {
  if (typeof turn !== 'function') throw new TypeError('A host model function is required')
  return Object.freeze({
    generate({ prompt }) {
      return turn(prompt)
    },
  })
}
