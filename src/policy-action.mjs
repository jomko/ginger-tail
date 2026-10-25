// Reusable deterministic policy checkpoint. This is NOT an action executor.
// The trusted host computes facts and implements permission decisions.
// Missing, malformed and ambiguous responses deny; no default allow path.
export function createPolicyCheck(check) {
  if (typeof check !== 'function') throw new TypeError('Trusted policy check required')
  return async function checkAction(action, facts) {
    if (!action || typeof action !== 'object' || Array.isArray(action))
      throw new TypeError('Action proposal must be an object')
    const verdict = await check(action, facts)
    if (verdict === true || verdict?.allow === true) return { allow: true }
    // Missing/invalid checks fail closed. Never display secret exception data.
    return { allow: false, reason: typeof verdict?.reason === 'string' &&
      verdict.reason.length <= 200 ? verdict.reason : 'policy-denied' }
  }
}
