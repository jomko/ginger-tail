# Ginger Tail Runtime Contracts (v1)

**Status:** experimental contract for the existing **offline wake prototype**. This is
not a stable API and not yet the orchestration used by the private reference
agent. The reference agent currently consumes three separate Tail modules:
`history-context`, `attention-core`, and `thought-core`.

## What this step delivers

`ginger-tail/contracts` publishes runtime assertions and TypeScript
declarations. The same assertions are used by the existing `runWake`
implementation; they do not introduce a second scheduler, agent, or model
invocation.

```js
import { runWake, createFileStore } from 'ginger-tail'
import { WAKE_CONTRACT_VERSION, parseWakeDecision } from 'ginger-tail/contracts'
```

The executable v1 contract has five participating roles:

| Role | v1 interface | Owns | Never receives |
| --- | --- | --- | --- |
| Identity | `{ id }` | Stable agent identifier; additional persona fields stay with the caller | Host authentication |
| State | `withLock / load / save` | Local persistent wake state and lock | Untrusted authority to perform external actions |
| World | `observe`, optional `execute` | External observations and a trusted execution adapter | The private creator's files by default |
| Cognition | `decide({ identity, observation, state })` | A bounded **proposal**: rest or action | Permission to execute its own proposed action |
| Policy | `authorize({ identity, action, observation, state })` | Independent explicit permission for each external action | Hidden default approval |

The default policy denies every proposed external action. Only the exact
boolean `true` authorizes execution. No policy adapter or no executor means
an action cannot be executed.

### Proposed actions are not permissions

```js
{ kind: 'rest' }
// or
{ kind: 'action', action: { kind: 'log', payload: { message: 'synthetic' } } }
```

A proposed action is JSON-serializable and bounded to **4096 bytes**.
Observations are bounded to **16384 bytes**. These are the same byte
ceilings that existed in the prototype before this contract extraction.

Before executing a permitted action, the store persists a pending record
with its action ID. Only a bounded receipt with
`{ status: 'confirmed', receiptId: '...' }` confirms completion. If execution
fails or its result is uncertain, the next wake is blocked; the engine never
retries an uncertain write automatically.

### State and continuity

The first implementation uses `createFileStore` with one JSON file and
an exclusive file lock. A custom state adapter must preserve the same
single-writer guarantee and fail closed on corrupt state.

**The prototype store is not a drop-in replacement for Ginger's existing
action journal or attention and thought stores.** Those stay where they are.
No state migration is authorized by these contracts.

### Model and memory adapters

The public type declarations also describe `ModelPort` (`generate`) and
a read-only `MemoryPort` (`recall`). These are **future seams**, not
registered callbacks in `runWake` yet.

The future model adapter will handle bounded model invocation; cognition
will interpret the result and decide whether to think further, remember,
share, compose, or rest. These decisions are separate in the reference
agent and must remain separate during extraction.

The future memory adapter must preserve provenance, source boundaries,
uncertainty and the distinction between a remembered fact and a model
claim. Merely implementing `recall` is not proof that those constraints
hold.

### Reference-agent migration boundaries

The currently deployed private Ginger still owns:
- One systemd timer and guarded wake entrypoint.
- Its real cognition loop, prompts, personality and state.
- Model sandbox and authorization proof.
- Orbitar adapter, publication gates, and action journal.
- Private memories and creator-only context.

Runtime Contracts v1 **does not change any of those**. Before migrating
production cognition, use compatibility tests that compare existing
decisions, model-call ceilings, silence, provenance, write receipts and
rollback behavior. Only then introduce one Tail orchestrator that the
private reference agent actually calls.

## Acceptance criteria

- All existing offline wake tests pass without behavior changes.
- Public contracts and TypeScript declarations use the same named exports.
- Synthetic negative tests reject malformed proposals, missing adapters,
  oversized observations and unconfirmed action receipts.
- Tests use no external model, social account, private identity or state.
- No new schedule, daemon, live write path or permission grant.
