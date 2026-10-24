/**
 * One model-turn budget for one wake. All user/world adapters remain in the
 * owning agent. The controller never performs an external action.
 */
export interface CognitionControl<Action = unknown, Reply = unknown> {
  ask(prompt: string): Promise<Reply> | Reply
  decide(prompt: string, allowed?: (action: Action) => boolean): Promise<Action | null>
  callsLeft(): number
  canExplore(): boolean
  recordAction(action: Action): void
  snapshot(): Readonly<{ modelCalls: number; explored: number; invalidReplies: number }>
}

export interface CognitionControlOptions<Action = unknown, Reply = unknown> {
  model(prompt: string): Promise<Reply> | Reply
  parseReply(reply: Reply): Action
  /** Return a category only for recoverable invalid replies; otherwise null. */
  invalidReason(error: unknown): string | null
  invalidActionError(reason: 'not-allowed-here'): Error
  onInvalidReply?(reason: string): void
  retryNote?: string
  explorationAction?(action: Action): boolean
  maxModelCalls?: number
  maxExplorationSteps?: number
  /** Allowed invalid replies beyond the first; default 1. */
  maxInvalidReplies?: number
}

export declare function createCognitionControl<Action = unknown, Reply = unknown>(
  options: CognitionControlOptions<Action, Reply>
): CognitionControl<Action, Reply>
