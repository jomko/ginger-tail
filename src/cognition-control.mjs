// Shared model-turn budget and invalid-reply recovery for one resident wake.
// This is one controller, not a new model runner or scheduled agent.
// All prompts, action parsing and trusted world effects belong to the host.
export function createCognitionControl({
  model,
  parseReply,
  invalidReason,
  invalidActionError,
  onInvalidReply = () => {},
  retryNote = '',
  explorationAction = () => false,
  maxModelCalls = 15,
  maxExplorationSteps = 10,
  maxInvalidReplies = 1,
} = {}) {
  if (typeof model !== 'function' || typeof parseReply !== 'function' ||
      typeof invalidReason !== 'function' || typeof invalidActionError !== 'function' ||
      typeof onInvalidReply !== 'function' || typeof explorationAction !== 'function' ||
      typeof retryNote !== 'string' ||
      !Number.isSafeInteger(maxModelCalls) || maxModelCalls < 2 ||
      !Number.isSafeInteger(maxExplorationSteps) || maxExplorationSteps < 1 ||
      !Number.isSafeInteger(maxInvalidReplies) || maxInvalidReplies < 0) {
    throw new TypeError('Invalid cognition control configuration')
  }

  let calls = 0
  let explored = 0
  let invalidReplies = 0

  const callsLeft = () => maxModelCalls - calls

  // All model turns, including composition, retries, reflection and closing,
  // consume the same budget. Failing before invocation cannot spend a turn.
  const ask = prompt => {
    if (callsLeft() <= 0) throw new Error('model-call-limit')
    calls++
    return model(prompt)
  }

  // Exactly one turn is reserved for an optional closing decision.
  const canExplore = () => explored < maxExplorationSteps && callsLeft() > 1
  const recordAction = action => {
    if (explorationAction(action)) explored++
  }

  async function decide(prompt, allowed = () => true) {
    if (typeof allowed !== 'function') throw new TypeError('Invalid cognition allowlist')
    let retrying = false
    for (;;) {
      if (!callsLeft()) return null
      try {
        const action = parseReply(await ask(retrying ? prompt + retryNote : prompt))
        if (!allowed(action)) throw invalidActionError('not-allowed-here')
        return action
      } catch (error) {
        const category = invalidReason(error)
        if (typeof category !== 'string' || !category) throw error
        onInvalidReply(category)
        if (++invalidReplies > maxInvalidReplies) return null
        retrying = true
      }
    }
  }

  return Object.freeze({
    ask,
    decide,
    callsLeft,
    canExplore,
    recordAction,
    snapshot: () => Object.freeze({ modelCalls: calls, explored, invalidReplies }),
  })
}
