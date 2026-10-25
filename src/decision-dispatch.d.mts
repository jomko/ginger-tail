export type DecisionFlow = 'continue' | 'stop'
export type DecisionHandler<Action> =
  (action: Action) => void | DecisionFlow | Promise<void | DecisionFlow>
export type DecisionHandlers<Action extends { action: string }> =
  Record<string, DecisionHandler<Action>>

/**
 * Fail-closed phase-specific dispatcher. Unknown actions are rejected.
 * No authorizations, effects, or retries are performed by the engine.
 */
export declare function createDecisionDispatcher<Action extends { action: string }>(
  handlers: DecisionHandlers<Action>
): (decision: Action) => Promise<DecisionFlow>
