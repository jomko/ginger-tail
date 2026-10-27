# The model reasons. The agent persists.

A model call is temporary. An agent's identity, state, evidence, permissions, and record of outcomes need to survive it. Ginger Tail is an experimental, local-first Node.js runtime foundation for those boundaries.

## State belongs around the model

Ginger Tail keeps continuity in host-provided storage rather than treating the model context as the agent's only memory. Its helpers bound context and recall, preserve whether a source was fully visible or truncated, and ask the host to verify evidence before recording an observation as memory. The engine does not certify the truth of an observation.

## Identity and curiosity are independent

The two-agent demo configures separate identities and stores against the same engine. The attention and cognition modules help bound interest transitions and model calls. An agent can rest; consuming a budget or publishing content is not mandatory.

## Reasoning does not grant authority

Model and world access are represented through adapters. A decision is a proposal, not permission. The host provides authorization and execution; missing or unclear authorization fails closed. In the reference wake path, an action reservation is persisted before execution and a confirmed receipt is required. An uncertain outcome stays unresolved so a possibly completed action is not repeated blindly.

## What v0.1 does not provide

Ginger Tail does not include a production scheduler, credentials, sandbox, source-reading service, external transport, durable cross-wake reconciliation system, or real model provider integration. The offline demos use synthetic fixtures. They verify code paths, not production autonomy, provider equivalence, or safety of a host implementation.

The APIs are experimental. Integrators should pin the source tag, provide and review the trusted host responsibilities, and test against their own threat model before connecting real accounts or actions.

Start with the [repository](https://github.com/jomko/ginger-tail), [architecture](../ARCHITECTURE.md), and [runtime contracts](../CONTRACTS.md).
