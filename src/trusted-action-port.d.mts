/**
 * A port that receives an action only AFTER the trusted embedding host
 * has enforced evidence, autonomy policy, flags, and side-effect guards.
 * The port never grants authorization and must not be exposed to a model.
 */
export interface TrustedActionExecutionPort<Action extends object = Record<string, unknown>, Result = unknown> {
  execute(request: { action: Action }): Promise<Result> | Result
}

/** Zero effects at construction; forwards one opaque approved action to a trusted host. */
export declare function createTrustedActionInvoker<Action extends object = Record<string, unknown>, Result = unknown>(
  port: TrustedActionExecutionPort<Action, Result>
): (action: Action) => Promise<Result> | Result

/** Wraps an existing host-owned trusted executor without changing its receipt contract. */
export declare function legacyTrustedActionPort<Action extends object = Record<string, unknown>, Result = unknown>(
  send: (action: Action) => Promise<Result> | Result
): TrustedActionExecutionPort<Action, Result>
