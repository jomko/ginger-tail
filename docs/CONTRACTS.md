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

### Step 2 — Resident cognition control (first integration seam)

`ginger-tail/cognition-control` owns a single wake's **model-call
accounting, exploration ceiling, reserved closing turn and bounded recovery
of invalid model replies**. It accepts host callbacks for the model,
parsing, error classification, technical retry note and exploration-action
classification. It contains no character, prompt, Orbitar, Codex or secrets.

```js
import { createCognitionControl } from 'ginger-tail/cognition-control'

const turn = createCognitionControl({
  model: async () => ({ action: 'rest' }),
  parseReply: value => value,
  invalidReason: () => null,
  invalidActionError: reason => Error(reason),
})
const decision = await turn.decide('Choose a permitted action')
```

A genuine `rest` returns immediately and does not force the agent to
consume its budget. Only invalid replies are eligible for one retry
across the **whole wake**, never per action. Transport errors remain
fatal. All model invocations count against the same hard ceiling,
including composition, reflection and closing. The exploration loop
leaves one call available for an optional closing choice.

**This is not yet a complete shared cognition loop.** The reference
agent remains responsible for action dispatch, memory, evidence checks,
publication safeguards and its existing state. Those responsibilities
must be migrated through separate, regression-tested seams. The synthetic
offline `runWake` can drive its decision callback through this controller
without starting a second agent.

## Step 2 — Shared exploration and closing driver

`ginger-tail/cognition-journey` is the **single scheduler of exploratory
decision turns and the optional closing decision**. It uses the previously
extracted `createCognitionControl` model budget. An async generator yields
each model proposal back to the host; only the host may execute it.

```js
import { createCognitionControl } from 'ginger-tail/cognition-control'
import { explorationTurns, closingTurn } from 'ginger-tail/cognition-journey'

const control = createCognitionControl({
  model: async () => ({ action: 'rest' }),
  parseReply: value => value,
  invalidReason: () => null,
  invalidActionError: reason => Error(reason),
})
for await (const proposal of explorationTurns({
  control, prompt: () => 'Choose an action or rest.',
})) {
  if (proposal === null || proposal.action === 'rest') break
  // Only the host may validate and execute a proposed action.
}
// Only if the host did not stop voluntarily:
// await closingTurn({ control, prompt: () => 'Final choice.' })
```

**Behavioral invariants:** prepare each turn before building its prompt;
charge exploration actions before host dispatch; invalid replies surface
as a single null decision and do not execute; a voluntary rest/carry
never schedules a closing turn; one call remains reserved for an
optional closing decision when available; no model calls after the
budget is exhausted. Concurrent journeys with one controller are
refused. The driver neither posts nor reads private files.

This is **not** a complete extraction of private Ginger's dispatch and
world adapters: it owns only the exploration sequence and optional
closing choice. The existing synthetic `runWake` is still an offline
single-turn demonstration, not another deployed resident.

## Step 2 — Trusted action outcomes (third seam)

`ginger-tail/action-outcomes` classifies **results returned by a trusted
world executor**. It never treats a model's proposed text as a result,
proof of authorization, or a reason to repeat an external side effect.

The classification is intentionally small:
- `committed` from an already validated agent bridge: **confirmed**.
- `confirmed` only with a bounded, nonempty receipt ID: **confirmed**.
- `blocked` or `failed`: **rejected** (no side effect confirmed).
- `uncertain`, missing, malformed or unknown status: **uncertain**.

The standalone `runWake` requires an explicit receipt and rejects bare
`committed` results. The Ginger bridge has its own deterministic
validation and trusted action journal; it may use the `committed` form.

A `createActionOutcomeGate()` blocks further external writes **within
one wake** once any write result is uncertain. A confirmed or rejected
write does not clear this brake. The host owns all persistence, global
idempotency, locks, authorization, and cross-wake reconciliation.

```js
import { createActionOutcomeGate } from 'ginger-tail/action-outcomes'

const gate = createActionOutcomeGate()
if (!gate.blockedReason()) {
  // A previously authorized, trusted executor returns this result:
  gate.observe({ status: 'uncertain' })
}
console.log(gate.blockedReason()) // "earlier write uncertain"
```

This classifier never issues a write and never retries one. It does not
replace Ginger's `ResidentActionController` or its vote ledger; those
remain the authority for pending writes across wake processes.

## Step 2 — Trusted decision dispatch (final routing seam)

`ginger-tail/decision-dispatch` maps a *validated* cognition decision to
an explicitly registered host handler. It is not a model action parser,
authorization mechanism, or executor. The host registers distinct
exploration and closing-phase handlers to retain the phase boundary.

An unregistered action, including inherited object property names,
fails closed; model output never supplies or overrides a handler.
Handlers return `'stop'` for voluntary completion and otherwise
`'continue'` (or no value). External errors propagate without retry.

```js
import { createDecisionDispatcher } from 'ginger-tail/decision-dispatch'
const dispatch = createDecisionDispatcher({
  rest: () => 'stop',
  read: async action => { /* Trusted host handles this action. */ },
})
const signal = await dispatch({ action: 'rest' }) // 'stop'
```

The public engine only decides **which registered callback** receives
the proposal. The private host retains its source visibility, trusted
action bridge, action journal, vote ledger, permission checks, prompts,
model isolation, character, memory and filesystem state. It must never
register raw model-generated callback names or handlers.

## Step 3 — Provider-neutral model port

`ginger-tail/model-port` defines the single runtime-facing interface:
`port.generate({ prompt })`, returning an **untrusted value** or
propagating the host's error. It neither invokes a model when constructed
nor catches/retries a failed invocation.

```js
import { createModelInvoker, legacyModelPort } from 'ginger-tail/model-port'

const port = legacyModelPort(async prompt => ({ action: 'rest' }))
const model = createModelInvoker(port)
const reply = await model('Synthetic prompt') // still untrusted
```

The cognition controller remains the **only** model-turn counter.
The real host supplies its own protected model runner and keeps
authentication, credential refresh, sandbox mounts, tool restrictions,
probe-before-call, output bounds and timeout enforcement outside Tail.
No other model provider is enabled automatically.

Ginger's historical callback `model(prompt)` is bridged with
`legacyModelPort` for existing tests and callers. New callers can pass
an explicit `modelPort` to the resident `once` API. The same
trusted action parser remains after the adapter. The synthetic
`runWake` demo still has no direct model port of its own.

## Step 4 — Read-only resident world port

`ginger-tail/world-read-port` is a minimal **read-only** boundary for the
production resident, separate from the offline prototype's `WorldPort`
(which also describes a trusted `execute` callback). It forwards
`(operation, input)` to a host-provided `read({ operation, input })`
and returns **untrusted observations** without decoding or interpreting
them. The port never performs a read during construction.

```js
import { createWorldReader, legacyWorldReadPort } from 'ginger-tail/world-read-port'
const readWorld = createWorldReader(legacyWorldReadPort(async (op, input) => {
  // The host validates operations, enforces visibility and owns transport.
  return { operation: op, input }
}))
const observation = await readWorld('synthetic-post', { id: 1 })
```

Tail validates the generic operation name but **does not authorize it**.
For Ginger, its private `orbitarRead` still enforces the exact endpoint
allowlist, keeps the session ID and API base URL in the host's closure,
and retains network timeouts and Orbitar error handling. The world port
does not receive that configuration or credentials.

This initial step covers remote **observations**, not effects: the
resident's `bridgeSender`, vote ledger, write policy, durable pending
journal, archival reads and source checks stay private. No generic
`execute` is exposed by this module; a future trusted action boundary
must not bypass explicit permission checks or the persistent journal.
The offline `runWake` prototype is unchanged.

## Reference-agent migration boundaries

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

## Trusted action execution port (0.0.12)

`createTrustedActionInvoker` from `ginger-tail/trusted-action-port` forwards
`{ action }` to exactly one trusted host `execute` callback. Its output is an
opaque host receipt; no authorization, side effects, retries, state or
credentials live in the public module. `legacyTrustedActionPort(send)` keeps
the existing host sender signature. An invalid port or non-object payload is
rejected before any callback. Model output is only a proposal and must NEVER
be supplied directly to this invoker: Ginger's prechecks, policy, enabled
flags, per-wake gate, vote ledger, write journal and uncertainty brake stay
private and upstream of the transport. This first production slice does not
create an independently capable world executor or a second resident loop.

## v0.1 memory continuity and policy

`createMemoryContinuity({ recall, verifyEvidence, append })` takes trusted
host-owned adapters. Memory search uses bounded `limit/maxChars`, skips
truncated or unsourced rows, and leaves result contents unchanged.
`remember(note, evidenceContext)` verifies the source through the host
callback and appends only when verified. This means *source was actually
available*, not *statement is independently true*. No model-supplied
`verified` property can override the host callback.

`createPolicyCheck(check)` wraps a host decision. Only explicit
`true` or `{ allow: true }` allows an already proposed action.
The private host still owns facts, permissions, side-effect ceilings,
action journals and emergency-stop behavior. `runWake` retains its own
default-deny authorization and persist-before-execute receipt workflow.

Run `npm run demo:two-agents` for an isolated demonstration of one
generic engine hosting two independent synthetic agents.
