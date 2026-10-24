import type { CognitionControl } from './cognition-control.mjs'

/**
 * The public engine schedules model decisions, while the host executes them.
 * No model invocation happens outside the provided controller.
 */
export interface ExplorationOptions<Action> {
  control: CognitionControl<Action>
  beforeTurn?: () => void | Promise<void>
  prompt: () => string | Promise<string>
}

/**
 * An invalid final model decision is yielded as null once. The host may
 * voluntarily break on rest/carry without triggering a closing call.
 */
export declare function explorationTurns<Action>(
  options: ExplorationOptions<Action>
): AsyncGenerator<Action | null, void, unknown>

export interface ClosingOptions<Action> {
  control: CognitionControl<Action>
  prompt: () => string | Promise<string>
  allowed?: (action: Action) => boolean
}
export type ClosingResult<Action> = {
  decision: Action | null
  noCalls: boolean
}
export declare function closingTurn<Action>(
  options: ClosingOptions<Action>
): Promise<ClosingResult<Action>>
