/**
 * Read-only resident world port. The host owns authorization and transport.
 * Neither the request nor the returned value has action authority.
 */
export interface ResidentWorldReadPort<Input = unknown, Result = unknown> {
  read(request: { operation: string; input: Input }): Promise<Result> | Result
}

/** Lazy, provider-neutral reader; never performs a read on construction. */
export declare function createWorldReader<Input = unknown, Result = unknown>(
  port: ResidentWorldReadPort<Input, Result>
): (operation: string, input: Input) => Promise<Result> | Result

/** Bridges a trusted existing host (operation, input) reader. */
export declare function legacyWorldReadPort<Input = unknown, Result = unknown>(
  read: (operation: string, input: Input) => Promise<Result> | Result
): ResidentWorldReadPort<Input, Result>
