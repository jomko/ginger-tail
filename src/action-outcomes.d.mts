/** A classification, never an authorization or a trusted execution receipt. */
export type ActionOutcome = 'confirmed' | 'rejected' | 'uncertain'
export declare function classifyActionOutcome(
  result: unknown,
  options?: { requireReceipt?: boolean },
): ActionOutcome

/** A per-wake brake. Persistent pending state belongs to the host. */
export interface ActionOutcomeGate {
  blockedReason(): string | null
  observe(result: unknown): ActionOutcome
}
export declare function createActionOutcomeGate(
  options?: { reason?: string },
): ActionOutcomeGate
