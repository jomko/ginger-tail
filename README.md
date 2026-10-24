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

**Early extraction / architecture stage.**

This repository does **not yet** contain a usable standalone engine, package, installation instructions, or a stable API. Nothing here should be presented as production-ready. The first milestone is a minimal, independently testable runtime with a synthetic demonstration agent.

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

A license has **not yet been selected**. Public visibility alone does not grant an open-source software license. License selection is required before the first reusable code release.
