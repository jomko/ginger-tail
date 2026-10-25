// Classify results returned by a TRUSTED external-action adapter.
// Never pass raw model output here as evidence of authorization or success.
// This module does no I/O and never retries a side effect.

export function classifyActionOutcome(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'uncertain'
  switch (result.status) {
    case 'confirmed':
      // The standalone wake has its own explicit receipt contract.
      return typeof result.receiptId === 'string' &&
        result.receiptId.length > 0 && result.receiptId.length <= 200
        ? 'confirmed' : 'uncertain'
    case 'committed':
      // Only the trusted Ginger action bridge may issue this status.
      return 'confirmed'
    case 'blocked':
    case 'failed':
      return 'rejected'
    case 'uncertain':
      return 'uncertain'
    default:
      // A missing/malformed bridge reply might hide a completed write.
      return 'uncertain'
  }
}

// A single-wake brake, not a replacement for a durable action journal.
// The host must own authorization, idempotency, persistent pending state
// and reconciliation across wakes. Unknown outcomes never permit a retry.
export function createActionOutcomeGate({ reason = 'earlier write uncertain' } = {}) {
  if (typeof reason !== 'string' || !reason) {
    throw new TypeError('A nonempty block reason is required')
  }
  let blocked = false
  return Object.freeze({
    blockedReason: () => blocked ? reason : null,
    observe(result) {
      const outcome = classifyActionOutcome(result)
      if (outcome === 'uncertain') blocked = true
      return outcome
    },
  })
}
