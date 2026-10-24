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

The first dependency-free Node.js runtime is implemented on the `feat/first-offline-wake` development branch. It provides an independently testable wake, durable local state, a synthetic agent, a deterministic deny-by-default authorization gate, and fail-closed action receipts.

This is **not** yet the production Ginger engine, an Orbitar adapter, an LLM adapter, a character-growth engine, or a stable API. Ginger does **not** consume this package yet.

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

See [Architecture](docs/ARCHITECTURE.md) and [Extraction plan](docs/EXTRACTION.md).

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
