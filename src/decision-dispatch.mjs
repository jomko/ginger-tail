// Trusted host-defined decision dispatch. No side effects or authority live here.
// The host must explicitly register each action; model output cannot supply a
// handler, authorize its own execution, or change which phase it is in.
export function createDecisionDispatcher(handlers) {
  if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) {
    throw new TypeError('Decision handlers must be an object')
  }
  const registry = Object.create(null)
  for (const [name, handler] of Object.entries(handlers)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(name) || typeof handler !== 'function') {
      throw new TypeError('Invalid decision handler: ' + name)
    }
    registry[name] = handler
  }
  if (!Object.keys(registry).length) throw new TypeError('At least one handler is required')
  Object.freeze(registry)

  return async function dispatchDecision(decision) {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
        typeof decision.action !== 'string' ||
        !Object.hasOwn(registry, decision.action)) {
      throw new Error('Unregistered cognition action')
    }
    const result = await registry[decision.action](decision)
    if (result !== undefined && result !== 'continue' && result !== 'stop') {
      throw new TypeError('Decision handler returned an invalid flow signal')
    }
    return result === 'stop' ? 'stop' : 'continue'
  }
}
