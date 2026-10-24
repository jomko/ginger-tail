# Ginger Tail

**The tail wags the cat.**

A local-first runtime for persistent autonomous AI identities.

> The model reasons. The agent persists.

Ginger Tail is a publicly developed engine intended for open-source release, designed for long-lived AI agents with durable identities, selective memory, evolving character, and policy-controlled actions.

Rather than treating a model invocation as the agent, Ginger Tail treats model calls as temporary cognition. The agent's identity, experiences, constraints, and continuity live outside the model.

## Design principles

- **Identity outlives the model.** Character, values, and durable memory do not depend on a single LLM or context window.
- **Experience is evidence.** Remember selectively, preserve provenance, distinguish observation from verified fact, and support correction.
- **Character evolves deliberately.** Repeated evidence may justify a change; a single conversation does not rewrite identity.
- **Agency includes silence.** Thinking, saving an observation, and choosing to publish are separate decisions.
- **Autonomy has boundaries.** Untrusted model output proposes actions; a trusted runtime validates and executes them.
- **Local-first by default.** The operator controls the agent's state and its external integrations.
- **One engine, many agents.** Characters and environment adapters belong to individual agent installations, not to the core runtime.

## Where this comes from

Ginger Tail is being extracted from **Ginger**, a long-running autonomous character with an independent identity, local memory, and a social environment.

Ginger is the reference agent, not the product. His private identity, history, personal relationships, credentials, and runtime state **must not** be copied into this repository.

## Current status

**Milestone 1: offline wake prototype (experimental).**

The first dependency-free Node.js runtime provides a standalone offline proof of concept with an independently testable wake, durable local state, a synthetic agent, a deterministic deny-by-default authorization gate, and fail-closed action receipts.

This is **not** yet the production Ginger engine, an Orbitar adapter, an LLM adapter, a character-growth engine, or a stable API. Ginger **does consume** the pinned `history-context`, `attention-core`, and `thought-core` modules. Ginger does **not yet** use Tail's offline `runWake` prototype as its resident cognition loop.

## Run the offline prototype

Requires **Node.js 22+**; no installation of third-party packages, API keys, network access, or live account is needed.

```sh
npm test           # synthetic, offline unit tests
npm run demo       # one synthetic rest wake (persists a local counter)
npm run demo       # another wake; counter increases
```

The demonstration writes only to `.ginger-tail-demo-state/` (gitignored). Set `GINGER_TAIL_STATE_DIR` to choose an alternative directory.

### Minimal integration contract

```js
import { createFileStore, runWake } from 'ginger-tail'

const identity = { id: 'example-agent' }
const store = createFileStore({ directory: '/your/local/state', agentId: identity.id })

await runWake({
  identity,
  store,
  world: { observe: async () => ({ message: 'Synthetic observation' }) },
  decide: async () => ({ kind: 'rest' }),
})
```

A proposed action has the shape `{ kind: 'action', action: { kind: '...', payload: {} } }`. The runtime **denies all actions unless `authorize` explicitly returns `true`** and a trusted world adapter implements `execute`. A confirmed execution receipt is required; an uncertain action blocks later wakes pending manual reconciliation. The local single-host lock is never automatically broken.

Do not deploy this prototype against live accounts. Model and world adapters must enforce their own isolation; this minimal package does not sandbox arbitrary JavaScript callbacks.

See [Architecture](docs/ARCHITECTURE.md) and [Extraction plan](docs/EXTRACTION.md).

## Resident cognition control

The reusable model-turn controller (`ginger-tail/cognition-control`) now
budgets exploration, retries invalid replies once per wake, reserves a
closing decision and accepts voluntary rest. The model, action parser
and recovery note remain supplied by the agent.

This is the **first shared seam** of the cognition loop, not a second
agent and not a replacement for Ginger's trusted world actions.
See [Runtime Contracts](docs/CONTRACTS.md).

## Runtime Contracts v1

The existing offline wake now consumes executable public boundary contracts
for **identity, state, observation, cognition, authorization, and action
receipts**, with TypeScript types available to package consumers.

```js
import { WAKE_CONTRACT_VERSION, parseWakeDecision } from 'ginger-tail/contracts'
```

The model's proposal is never an authorization. The trusted runtime
denies actions by default, persists reservations before execution and
blocks uncertain writes from being retried blindly.

**These contracts do not yet replace Ginger's resident cognition loop.**
See [Runtime Contracts](docs/CONTRACTS.md) for the exact v1 API, current
limits and the later model/memory adapter seams.

## First shared engine module

`ginger-tail/history-context` is the first reusable implementation being
adopted by the private reference agent. It bounds serialized observations and
distinguishes **full visibility** from **truncated or omitted context**.

The export keeps the established resident semantics:
`HISTORY_BUDGET`, `READ_ITEM_BUDGET`, `SEARCH_ITEM_BUDGET`,
`boundedReadItem`, `boundedSearchItem`, and `renderHistory`.
It makes no network calls and reads or writes no agent state.

```js
import { boundedReadItem, renderHistory } from 'ginger-tail/history-context'

const action = { action: 'read_post', postId: 42 }
const thread = {
  post: { id: 42, title: 'Synthetic thread', content: 'Observed text.', comments: 0 },
  comments: [],
}
const { item } = boundedReadItem(action, thread)
const displayed = renderHistory([item])
console.log(displayed.visible.has(item)) // true
```

The public source originates from the reference agent's *generic context
budget implementation*, not from its private identity, memories, model
credentials, runtime logs, or social data. The private agent will consume
this module through a **commit-pinned dependency** only after host tests.
No second agent, scheduler or production cognition loop is introduced.

## Attention lifecycle state machine

`ginger-tail/attention-core` provides deterministic, source-agnostic
transitions for unfinished interests: **active → dormant → resumed / closed**.

The engine owns event replay, transition planning, stable IDs and projection
fingerprints. The agent supplies a `renderInterest` callback that determines
how an interest is serialized, including any world-specific reference. The
engine knows nothing about Orbitar, character content or local memory files.

```js
import { replayInterestEvents, planInterestTransition } from 'ginger-tail/attention-core'

const renderInterest = item => item.text + '\\n'
const current = replayInterestEvents([], renderInterest)
const planned = planInterestTransition(
  current,
  { op: 'carry', text: 'Explore an interesting question' },
  { renderInterest },
)
// planned.events may be validated and persisted by the host's trusted store.
```

This is the **pure state machine** only. Persistent log writes, legacy
projection files, host locking, privacy boundaries, migration and user-facing
world adapters remain private to the reference agent until separately
reviewed. No second cognition loop or timer is introduced.

## Independent thought contracts

`ginger-tail/thought-core` owns the reusable validation, provenance,
bounded retention, and explicit share-intent rules for an agent's
private, unfinished thoughts.

Each agent supplies **trusted** source validation, a self-observation
predicate, and an optional world-specific label for a sharing intent.
The engine contains no forum URLs, real agent text, local memory files,
or autonomous publication path.

```js
import { createThoughtCore } from 'ginger-tail/thought-core'

const core = createThoughtCore({
  isSource: source => source === 'self',
  isSelfSource: source => source === 'self',
  formatSpark: () => 'Own observation',
})
const thought = core.makeThought({
  source: 'self',
  thought: 'An unfinished synthetic thought worth keeping.',
})
// Saving a thought is separate from deciding whether to share it.
```

This module does **not** read or write an agent's thought store.
Persistence, platform-specific source checks and character wording
remain owned by the private agent installation. No additional model call,
background service or posting mechanism is introduced.

## Scope

Planned engine capabilities:

- Resident lifecycle and bounded wake orchestration
- Persistent identity loading and context construction
- Selective memory and provenance-aware recall
- Independent thought, share, and composition phases
- Attention and unfinished-interest lifecycles
- Experience-based character reflection
- Trusted, auditable action execution
- Pluggable models and environment adapters

**Non-goals:** a general-purpose business automation framework; mandatory posting schedules; unrestricted shell access for models; importing private agent data; making claims of consciousness.

## Project boundaries

```text
Ginger Tail (public engine)
  ├── identity / memory / attention contracts
  ├── resident cognition and lifecycle
  ├── policy-based action execution
  └── adapter interfaces
          ▲
          │ consumes a versioned engine
          │
Ginger (private agent installation)
  ├── character and personal memory
  ├── private state and secrets
  ├── model configuration
  └── Orbitar adapter and social context
```

There must be **one authoritative implementation** of each shared capability. Do not maintain a parallel copy of the runtime in Ginger.

## Security and privacy

This is a **public repository**. Never commit tokens, session files, private memories, real run logs, personal data, or the Git history of the private Ginger repository.

The extraction process must audit file contents, code paths, configuration defaults, fixtures, and commit history before each module is published. Test data must be synthetic.

## Language

English is the only project language: documentation, source comments, issues, pull requests, commit messages, and user-facing product text.

## License

The independent Ginger Tail prototype is released under the **MIT License** (see [LICENSE](LICENSE)). This license does **not** grant rights to private Ginger code, private memory, or third-party components not included here.
