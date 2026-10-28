# Runtime contracts · v0.1.0

**Experimental public interfaces.** They are small on purpose. The model is untrusted; the host is responsible for facts, secrets, state and side effects.

This document covers the offline `runWake` contract and the independently reusable resident modules. They are related, but **`runWake` is not a generic replacement for the reference Ginger resident**.

## 1. Offline wake (`ginger-tail`)

~~~js
import { runWake, createFileStore } from 'ginger-tail'

const identity = { id: 'example-agent' }
const store = createFileStore({ directory: './state', agentId: identity.id })

await runWake({
  identity,
  store,
  world: { observe: async () => ({ message: 'synthetic' }) },
  decide: async () => ({ kind: 'rest' }),
})
~~~

`runWake` calls these ports under a durable single-writer store lock:

| Port | Required | Contract |
| --- | --- | --- |
| `identity` | Yes | Object with stable `id` |
| `store` | Yes | `withLock`, `load`, `save`; must fail closed on corrupt state and meet the durability contract below |
| `world.observe` | Yes | One bounded, JSON-serializable observation |
| `decide` | Yes | One bounded rest or action proposal; **untrusted** |
| `authorize` | No | Returns exactly `true` to approve; absent means **deny** |
| `world.execute` | Only for approved action | Trusted implementation with confirmed receipt |

The decision format is:

~~~js
{ kind: 'rest' }
// or
{ kind: 'action', action: { kind: 'signal', payload: { message: 'synthetic' } } }
~~~

An observation is limited to **16,384 bytes**; an action proposal to **4,096 bytes**. Use `ginger-tail/contracts` for `parseWakeDecision` and the runtime assertions. The exact limit and validation are executable code, not prose-based permission.

### Side-effect transaction

~~~text
lock -> durability barrier -> load
  -> earlier action unresolved?
       exact completion_pending record -> finalize from its receipt (recovered); stop
       anything else                   -> blocked; stop
  -> observe -> decide -> authorize (default deny)
  -> persist reservation (durable, or no execution)
  -> trusted execution
  -> confirmed receipt?
       no  -> record uncertain; block later wakes
       yes -> phase 1: record the receipt durably, still blocking
              phase 2: clear the block (acted)
  -> release lock
~~~

The confirmed receipt has `{ status: 'confirmed', receiptId: '...' }` with a valid bounded ID. Missing, malformed, failing or uncertain receipts **do not** count as success. No blind automatic retry is permitted. A pending action requires explicit reconciliation (below), with one exception: a durable receipt whose block was not cleared is finalized by the next wake ([automatic completion recovery](#automatic-completion-recovery)). It is completion, not a retry.

**Why two phases.** A save can rename a new `state.json` into place and *then* fail its directory fsync. The new file is then visible, but it may not survive power loss. If one write both recorded the receipt and cleared the block, such a failure could leave a visible state that permits new actions while the wake reports failure. Two phases rule that out: a state that clears the block is only ever written after the receipt is durable.

| Result | Meaning | State afterwards |
| --- | --- | --- |
| `acted` | Receipt durable, block cleared durably | Permits the next action |
| `acted`, `durable: false` | Receipt durable; clearing the block not confirmed | Permits the next action, or holds the `completion_pending` record that the next wake recovers |
| `recovered` | This wake finalized an earlier `completion_pending` record from its receipt. Nothing was observed, decided or executed | Permits the next action |
| `uncertain`, `execution_failed` | `world.execute` threw; the effect may have happened | Blocked on this id |
| `uncertain`, `receipt_invalid` | No valid confirmed receipt | Blocked on this id |
| `uncertain`, `completion_not_persisted` | The effect **was** confirmed (`receipt` in the result; keep it), but the receipt could not be recorded durably | Blocked on this id. If the receipt record became visible and the next barrier confirms it, that wake recovers it; otherwise reconcile with the receipt |
| `reservation_not_durable` | The reservation became visible but its fsync failed. **`world.execute` was not called** | Blocked on this id; after power loss the reservation may be absent |
| rejection | Failure before any reservation became visible (including the barrier) | Unchanged; nothing executed |

For `uncertain`, `recorded` says whether the uncertain record was confirmed durable. Either way, the visible state blocks the action id: it is either the reservation or the uncertain record. `reservation_not_durable` is never cleared automatically, because the reservation may be durable. Resolve it as `not-executed`; the result itself is the host's evidence that `execute` was never entered. Pending records store only bounded diagnostics (`error.name`, `error.code`), never exception messages.

`signal` (an `AbortSignal`) cancels waiting on `observe`, `decide` and `authorize`. Once aborted, those ports are not invoked. It is **not** honored after the reservation is persisted: Tail never abandons an execution in flight.

### Guarantees and non-guarantees

Within the single-host filesystem assumptions below, Tail guarantees:

1. **At most one execution attempt per action id.** No code path calls `world.execute` again for an id.
2. **No execution without a durable reservation.** `execute` runs only after the reservation's directory fsync succeeded.
3. **An unresolved action stays blocking.** After a reservation is durable, every state Tail writes keeps the action blocked until a confirmed receipt is durable or `resolvePendingAction` records verified evidence. A failed write, a crash or a power loss can only expose an earlier state that still holds the reservation, or a later one that also blocks, or one that clears the block and already carries the durable receipt.
6. **Recovery never executes.** Automatic completion recovery does not call `observe`, `decide`, `authorize` or `execute`; it only finalizes an effect whose trusted receipt is already durable.
4. **No decision on non-durable state.** `withLock` fsyncs the directory before the callback reads, so a wake never acts on a state that is merely visible after an earlier failed fsync.
5. **No overlapping wakes** for one state directory on one host (see the lock section).

It does **not** guarantee exactly-once external effects. An unconfirmed effect may have happened once, and only the external system knows. It also does not guarantee that an `acted, durable: false` agent stays unblocked after power loss (its next wake may be a recovery wake), or that a verifier's `not-executed` is true.

### Automatic completion recovery

A completed action is cleared in two writes. If the first (the receipt record) is durable and the second (the clear) is lost to a failed write, a crash or a power loss, the state holds:

~~~js
pendingAction: { id, status: 'uncertain', kind, at, reason: 'completion_pending', receipt: { receiptId } }
~~~

The next `runWake` finalizes it **instead of** an ordinary wake and returns:

~~~js
{ outcome: 'recovered', actionId, receiptId, kind, wakes } // wakes unchanged
~~~

- **One atomic write.** It clears `pendingAction`, sets `lastReceipt` to the exact action id, receipt id and kind, sets `lastOutcome: 'recovered'`, and appends one audit entry to `state.reconciliations` (`resolution: 'confirmed'`, `automatic: true`, `resolvedBy: 'ginger-tail:completion-recovery'`). A later `resolvePendingAction` for that id reports `already-resolved`.
- **No world contact.** The recovery wake does not observe, decide, authorize or execute. The next wake is an ordinary one.
- **Idempotent.** Until the recovery write is durable, the same record is recovered again; once it is visible, the next barrier confirms it. A crash, `SIGKILL` or power loss at any point leaves either the unchanged record or the recovered state, never a second audit entry.
- **Fails closed.** If the recovery save fails, `runWake` rejects with the store's error. Before a rename nothing changed and the action stays blocked. After a rename whose fsync failed (`StateDurabilityError`, `replaced: true`), the visible state is cleared and already carries the receipt, exactly as after a failed phase 2.
- **Serialized.** It runs under the wake lock, after the durability barrier. A concurrent wake or reconciliation is refused with `WAKE_LOCKED`.

**Trust and durability assumptions.** The receipt in the record was written only by `runWake`, from a `world.execute` result that passed the confirmed-receipt check. Model output, observations and authorization results never reach `pendingAction.receipt`. The record counts as durable because the store's barrier confirmed it before `load` returned it; a custom `StatePort` must give that guarantee (see below). Tail trusts the local state file as much as it trusts its own writes: anyone who can write `state.json` can forge any state.

**What still needs manual reconciliation.** Only a record of exactly that shape is recovered: `status: 'uncertain'`, `reason: 'completion_pending'`, a valid id, a valid action kind, a receipt with exactly one valid `receiptId`, and no other fields. Everything else stays `blocked` until `resolvePendingAction`:

- a reservation (`pending`) after a crash, and every `execution_failed` or `receipt_invalid` record;
- `reservation_not_durable`, and `completion_not_persisted` when only the reservation survived;
- v0.1.0 pending records;
- a completion record that any reconciliation attempt already touched (for example a conflicting verdict or a failed verification), whose receipt was already applied to `lastReceipt`, or that is malformed in any way.

`resolvePendingAction` still resolves a `completion_pending` record explicitly, before any wake.

### Reconciling a pending action

A `pending` or `uncertain` action blocks every later wake until a trusted host or operator resolves it. Apart from [automatic completion recovery](#automatic-completion-recovery), Tail never decides this on its own. It never infers success or failure from missing state, and never retries the action.

~~~js
import { resolvePendingAction } from 'ginger-tail'

const result = await resolvePendingAction({
  identity, store,
  actionId: blocked.actionId,         // exact id; any other id is rejected
  resolvedBy: 'operator:alice',       // audit identity, not an authorization
  verify: async ({ actionId }) => {   // trusted lookup in the external system
    const found = await externalSystem.findByIdempotencyKey(actionId)
    return found
      ? { status: 'confirmed', actionId, receiptId: found.id }
      : { status: 'not-executed', actionId, evidenceId: 'lookup-2026-10-28' }
  },
})
// { outcome: 'resolved' | 'already-resolved' | 'unresolved', ... }
~~~

- The result comes **only** from `verify`'s evidence: `confirmed` needs a valid `receiptId`; `not-executed` needs an `evidenceId`. Both must echo the exact `actionId`. Anything else, including an authorization claim such as `{ authorized: true }` or a thrown error, gives `unresolved` and the block stays.
- If the pending record holds a receipt (`reason: 'completion_pending'`), only a `confirmed` verdict with **that** `receiptId` resolves it, and `not-executed` is rejected as a conflict.
- Return `not-executed` only when the external system guarantees that this action id can no longer take effect. A request still in flight that lands later would be a duplicate. Tail cannot detect that.
- Every attempt is recorded in `state.reconciliations`. Decisions (`confirmed`, `not-executed`) and failed attempts (`unresolved`) are retained separately, the latest 100 and 20 respectively, so a verifier that keeps failing cannot evict a decision. A repeat call for a resolved id returns `already-resolved` without calling `verify`. Hosts needing a complete audit should also log every returned result.
- If the resolution's own save is not confirmed durable, it throws `StateDurabilityError` (`replaced: true`). Call it again: the lock barrier first confirms or rejects the visible state, then the call reports `already-resolved` or resolves again.
- It runs under the same wake lock, so it cannot interleave with a wake. Never expose it to a model.

### File store: locking and durability

`createFileStore` is single-host local storage. Do not treat it as a distributed transaction coordinator, and do not share one state directory between hosts or between containers that do not share a PID namespace.

**Lock.** `wake.lock` is created atomically with `link(2)` from a fully written owner file (token, host, machine id, boot id, PID namespace, PID, process start time). The lock has no time-based lease, so a slow living process keeps it. An existing lock is removed automatically only when its owner is **provably** gone:

| Evidence | Verdict |
| --- | --- |
| Same host, boot and PID namespace; PID no longer exists or is a zombie | stale, recovered |
| Same host, boot and PID namespace; PID exists with a different start time (PID reuse) | stale, recovered |
| Same host name and machine id, different boot id (the host rebooted) | stale, recovered |
| PID exists with the same start time, or its start time cannot be read | live, refused |
| Other host name, other PID namespace, other machine, non-Linux host, malformed or v0.1.0 lock file | uncertain, refused and left intact |

Recovery takes an exclusive per-token claim (`wake.lock.recover-<token>`), then re-reads the token before deleting, so concurrent recoverers cannot delete a lock that was re-acquired in between. A claim is itself an owner record:

- If its holder is **provably dead** (same rules as above), the claim is removed by the same procedure one level down (`…recover-<token>.recover-<claim token>`). This works up to two nested abandoned claims.
- If the holder is alive, unprovable, or the nesting goes deeper, recovery fails closed with `recovery_in_progress` and nothing is removed.
- A claim for a token that no longer matches `wake.lock` is inert and may be deleted at any time.

A refused acquisition throws `WakeLockError` (`code: 'WAKE_LOCKED'`, message still contains `already locked`) with diagnostics in `error.lock`, including `claimOwner` for a blocking claim. `store.inspectLock()` reports the same diagnostics without changing anything. A recovered lock or claim emits a `GINGER_TAIL_STALE_LOCK` process warning.

**Containers.** A restarted container gets a new PID namespace, so a lock left by the previous container is `uncertain` (`different_pid_namespace`) and is never removed automatically. Ownership across namespaces cannot be proven from inside one, and guessing could run two wakes at once. Either run the agent with a stable PID namespace (for example `--pid=host`), or recover by hand.

**Manual lock recovery** (container restart, non-Linux host, v0.1.0 leftover lock, abandoned claim):

1. Stop **every** process and container that can open this state directory, and confirm they are gone (`docker ps`, `ps`, the orchestrator).
2. Run `store.inspectLock()` and note `reason`, `owner.pid`, `owner.hostname`, `owner.acquiredAt`. Confirm that this owner is among the processes stopped in step 1.
3. With nothing running, delete `wake.lock` and every `wake.lock.recover-*` file in the state directory.
4. Start one wake. If it reports `blocked`, reconcile that action with `resolvePendingAction` before anything else. A `recovered` result needs nothing further.

**Durability.** `save` writes and fsyncs a `0600` temporary file, renames it over `state.json`, then fsyncs the directory. Newly created state directories are fsynced into their parents. On a failure *before* the rename, the temporary file is removed and `state.json` is unchanged. On a failure *after* the rename (directory fsync), the new state is already **visible** but not confirmed durable. Do not assume the previous file is still there. `save` then throws `StateDurabilityError` (`code: 'STATE_DURABILITY_UNCONFIRMED'`, `replaced: true`, `unsupported: true|false`).

`withLock` fsyncs the directory after acquiring the lock and before its callback (the **durability barrier**). This confirms that what the callback reads is durable, and it makes a filesystem without directory fsync (for example on Windows) fail predictably before any observation, decision or effect. It throws `StateDurabilityError` with `replaced: false`. There is no silent downgrade.

A custom `StatePort` used with external effects must give the same guarantees: `withLock` exposes only durable state (automatic completion recovery relies on it); `save` resolves only once the state is durable; and a save that may have become visible without being durable rejects with `code: 'STATE_DURABILITY_UNCONFIRMED'` and `replaced: true`. Any other rejection must mean nothing was replaced.

**What the tests prove, and what they cannot.** The tests inject faults into each filesystem step, simulate power loss with a model in which a rename survives only after a later successful directory fsync, and kill real processes with `SIGKILL` at each persistence boundary. They do **not** prove what a given kernel, disk, controller cache, VM or network filesystem keeps after power loss. Known limits:

- macOS `fsync` does not flush the drive cache (`F_FULLFSYNC` is not available from Node).
- After a failed fsync, Linux may report a later fsync as successful even though data was dropped. ext4 normally aborts its journal instead.
- NFS, SMB and FUSE semantics for `link`, `rename` and fsync are unverified.

Power-cut testing on the target hardware is still required.

## 2. Model, cognition, and journey

### Model port

~~~js
import { createModelInvoker } from 'ginger-tail/model-port'

const model = createModelInvoker({
  generate: async ({ prompt }) => ({ action: 'rest' }),
})
const proposal = await model('Decide what to do') // still untrusted
~~~

The adapter provides **no** authentication, shell, tool execution, sandbox, retries, provider-specific streaming or isolation. The trusted host owns those features. The model is not called when a port is constructed.

### Bounded cognition

~~~js
import { createCognitionControl } from 'ginger-tail/cognition-control'
import { explorationTurns, closingTurn } from 'ginger-tail/cognition-journey'

const control = createCognitionControl({
  model,
  parseReply: reply => reply,
  invalidReason: () => null,
  invalidActionError: reason => new Error(reason),
  explorationAction: action => action.action === 'read',
  maxModelCalls: 5,
  maxExplorationSteps: 4,
})

for await (const action of explorationTurns({
  control,
  prompt: () => 'Choose one action, or rest.',
})) {
  if (action?.action === 'rest') break
  // The host alone may validate and handle proposed reads/actions.
}

// If exploration ended *without* voluntary rest, the host may ask a
// closing choice using closingTurn({ control, prompt, allowed }).
~~~

`cognition-control` counts **every** invocation: exploration, parsing retry, reflection, composition and optional closing. Its default ceiling is 15, but the host may configure a lower one. Exactly one closing call is reserved while exploring. An invalid reply can be retried once across a wake; a model transport error is **not** automatically retried.

`cognition-journey` yields **proposals** and runs no world effects. Breaking a journey does not force another call. Voluntary rest needs no artificial closing monologue.

## 3. Memory, attention, thoughts

### Source-backed memory

~~~js
import { createMemoryContinuity } from 'ginger-tail/memory-continuity'

const notes = []
const memory = createMemoryContinuity({
  recall: async () => notes.map(n => ({ path: n.source, text: n.text })),
  verifyEvidence: ({ source, context }) => context?.seen === source,
  append: async note => { notes.push(note) },
})

const result = await memory.remember(
  { source: 'synthetic:hill', text: 'A hill was observed.' },
  { seen: 'synthetic:hill' },
)
// result.status === 'recorded'
// result.classification === 'observation-not-fact'
~~~

`recall(query, {limit, maxChars})` returns bounded **whole** sourced rows; rows that will not fit are skipped rather than clipped and stripped of context. `remember` needs the trusted host to verify the **actual visibility** of the source. The host must also provide durable persistence, privacy rules, deduplication and state migrations.

Verification means *the source was available*; it does **not** certify the truth of an observation.

### Life between wakes

- `history-context` retains bounded observations and marks full vs partial visibility.
- `attention-core` plans/replays interest transitions (active, dormant, resumed, closed). Host stores the events and decides how interest text is rendered.
- `thought-core` validates the shape, provenance and bounded retention of a private thought; sharing is a separate intent, not an automatic post.

These are deterministic modules. They do not read someone's real files or publish anything.

## 4. World reads and trusted decisions

### Read-only observation

~~~js
import { createWorldReader } from 'ginger-tail/world-read-port'

const read = createWorldReader({
  read: async ({ operation, input }) => ({ operation, input }),
})
const observation = await read('synthetic-object', { id: 1 })
~~~

The port validates the generic operation name; the **host** must check its operation allowlist, network destination, identity and authorization. Returned observations remain untrusted.

### A policy checkpoint

~~~js
import { createPolicyCheck } from 'ginger-tail/policy-action'

const check = createPolicyCheck((action, facts) =>
  ({ allow: facts?.approved === true && action.kind === 'signal' }))

const verdict = await check({ kind: 'signal' }, { approved: false })
// { allow: false, reason: 'policy-denied' }
~~~

Only exact `true` or `{ allow: true }` allows a proposal; missing/ambiguous results deny. **Neither policy wrapper nor dispatcher invents facts.**

`decision-dispatch` chooses among trusted, explicitly registered handlers. `trusted-action-port` forwards an **already approved** action to a trusted executor and returns its receipt unchanged; it does not authorize, retry, normalize a response, or inspect credentials.

`action-outcomes` classifies trusted replies as confirmed/rejected/uncertain and blocks additional effects after an uncertain result **within one wake**. Durable journals and cross-wake reconciliation are host duties. Bare `committed` results from a verified Ginger bridge are not acceptable as standalone `runWake` receipts.

## 5. Package entrypoints

| Import | Concern |
| --- | --- |
| `ginger-tail` | `runWake`, `createFileStore`, contract assertions |
| `ginger-tail/contracts` | Executable v1 contract + types |
| `ginger-tail/history-context` | Bounded world context |
| `ginger-tail/attention-core` | Interest transitions |
| `ginger-tail/thought-core` | Independent thought contracts |
| `ginger-tail/cognition-control` | Turn budget, invalid reply handling |
| `ginger-tail/cognition-journey` | Exploration and closing |
| `ginger-tail/model-port` | `generate({ prompt })` adapter |
| `ginger-tail/world-read-port` | Trusted host read adapter |
| `ginger-tail/decision-dispatch` | Registered callback routing |
| `ginger-tail/trusted-action-port` | Host-only trusted execution forwarding |
| `ginger-tail/action-outcomes` | Trusted receipt classification |
| `ginger-tail/memory-continuity` | Bounded recall and source checks |
| `ginger-tail/policy-action` | Host policy checkpoint |

TypeScript declarations cover the contract and the typed runtime ports where shipped. The package targets **Node 22+**, with no third-party runtime dependencies.

## 6. What these contracts do *not* buy you

They do not give a model access to Orbitar, a filesystem, network credentials, a safe shell, a scheduler, automatic posting or universal compatibility with every LLM. No test of a synthetic provider is a production acceptance test of a real provider.

The reference Ginger host has its own model sandbox, permission gates, durable action journal and memory stores. Extraction happens module by module, using reviewed pinned versions and independent acceptance.

Run `npm test`, `npm run demo:model-swap`, and `npm run demo:two-agents`. Then examine [architecture](ARCHITECTURE.md) and [extraction boundaries](EXTRACTION.md) before connecting a real world.

*When in doubt, rest. Even cats need a checksum.*
