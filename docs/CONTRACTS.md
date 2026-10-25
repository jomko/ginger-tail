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
| `store` | Yes | `withLock`, `load`, `save`; must fail closed on corrupt state |
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
observe
  -> decide
  -> authorize (default deny)
  -> persist reservation
  -> trusted execution
  -> confirmed receipt?
       yes -> mark acted; clear pending
       no  -> quarantine uncertain; block later wakes
~~~

The confirmed receipt has `{ status: 'confirmed', receiptId: '...' }` with a valid bounded ID. Missing, malformed, failing or uncertain receipts **do not** count as success. No blind automatic retry is permitted. A pending action requires manual reconciliation.

`createFileStore` is single-host local storage. Do not treat it as a distributed transaction coordinator.

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
