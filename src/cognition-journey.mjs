// One shared exploration driver for a resident cognition wake.
// It schedules bounded decisions, not world actions: all effects, prompts,
// rest/carry handling, evidence and permissions remain with the host.
const active = new WeakSet()

function assertController(control) {
  if (!control || typeof control !== 'object' ||
      typeof control.canExplore !== 'function' ||
      typeof control.decide !== 'function' ||
      typeof control.recordAction !== 'function' ||
      typeof control.callsLeft !== 'function') {
    throw new TypeError('A cognition controller is required')
  }
}

/**
 * Yield each proposed action to the trusted host. Returning early, breaking,
 * or throwing stops the generator; there are no automatic follow-up turns.
 *
 * The controller owns both the exploration and model-call budgets. An action
 * is accounted for BEFORE the host sees it, as in Ginger's original loop.
 */
export async function* explorationTurns({ control, beforeTurn = () => {}, prompt } = {}) {
  assertController(control)
  if (typeof beforeTurn !== 'function' || typeof prompt !== 'function') {
    throw new TypeError('Exploration callbacks are required')
  }
  if (active.has(control)) throw new Error('Cognition journey already active')
  active.add(control)
  try {
    while (control.canExplore()) {
      await beforeTurn()
      const action = await control.decide(await prompt())
      if (action !== null) control.recordAction(action)
      yield action
      if (action === null) return
    }
  } finally {
    active.delete(control)
  }
}

/**
 * One closing choice after exploration ends for a non-voluntary reason.
 * The trusted host decides whether to ask it at all and handles the result.
 * No call is made when the model budget has been exhausted.
 */
export async function closingTurn({ control, prompt, allowed = () => true } = {}) {
  assertController(control)
  if (typeof prompt !== 'function' || typeof allowed !== 'function') {
    throw new TypeError('Closing callbacks are required')
  }
  if (active.has(control)) throw new Error('Cognition journey still active')
  const noCalls = control.callsLeft() === 0
  const decision = noCalls ? null : await control.decide(await prompt(), allowed)
  return { decision, noCalls }
}
