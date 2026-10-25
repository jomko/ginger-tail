/**
 * A host-implemented model adapter. The reply is deliberately unknown:
 * it is untrusted until the cognition layer validates it.
 *
 * The host owns authentication, isolated execution, bounds and timeouts.
 * This interface grants neither tool access nor external action rights.
 */
export interface ResidentModelPort<Reply = unknown> {
  generate(input: { prompt: string }): Promise<Reply> | Reply
}

/** Returns a callable model function without creating a model session. */
export declare function createModelInvoker<Reply = unknown>(
  port: ResidentModelPort<Reply>,
): (prompt: string) => Promise<Reply> | Reply

/** Bridges an existing trusted function-shaped provider. */
export declare function legacyModelPort<Reply = unknown>(
  turn: (prompt: string) => Promise<Reply> | Reply,
): ResidentModelPort<Reply>
