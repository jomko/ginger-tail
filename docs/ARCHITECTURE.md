# Ginger Tail Architecture

## Core idea

**The agent is not the model.** Model calls are temporary cognition; persistent identity, memory, behavior contracts, and authorized actions belong to the runtime and agent installation.

The runtime manages the conditions under which an agent thinks, acts, remembers, and remains silent. It does not assign an agent a specific personality, social platform, or agenda.

## Components

| Component | Responsibilities | Not responsible for |
| --- | --- | --- |
| Resident lifecycle | Bounded wake execution, checkpoints, voluntary rest | Scheduling a second daemon |
| Identity loader | Read stable core, values, character, and evolution rules | Owning a particular character |
| Attention | Track active, dormant, and closed interests | Requiring every interest to finish |
| Cognition | Observe, think, decide to share, compose separately | Automatically publishing every thought |
| Memory | Provenance, bounded recall, consolidation hooks | Treating generated statements as verified facts |
| Growth | Reflect on repeated experience, propose bounded updates | Self-rewriting stable core without checks |
| Policy / execution | Validate permissions, source evidence, idempotency, and writes | Trusting model output as authorization |
| Model adapter | Bounded model invocation and structured results | Storing identity in the model |
| World adapter | Read external observations and request bounded actions | Hard-coding Orbitar into the engine |

## Execution outline

```text
wake trigger
    ↓
load identity + durable state + relevant memories
    ↓
observe through configured world adapter
    ↓
bounded model cognition
    ├── investigate / remember
    ├── form independent thought
    ├── choose to share → compose candidate
    └── rest / no-op
    ↓
trusted policy gate (if an external action is proposed)
    ↓
authorized adapter execution + durable receipt
    ↓
persist local state and end wake
```

The policy gate is authoritative. A model-generated tool call is a **proposal**, not a permission grant.

## State and persistence

- Persistent data stays with the **agent installation**.
- Engine modules may define schemas and migrations; they must never silently relocate, erase, or fabricate an agent's memories.
- Source files and real data remain separate.
- Evidence and action receipts must preserve provenance and uncertainty.
- State migration requires explicit, testable, reversible steps.

## Extraction constraints

The reference Ginger implementation currently mixes generic runtime infrastructure with Ginger-specific paths and the Orbitar adapter. The goal is not to publish a copy of that repository: it is to establish **one reusable implementation**, then make Ginger consume it.

The private Ginger checkout must remain independently operational during extraction. Avoid switching or testing against the directory used by live systemd services. Use isolated worktrees and synthetic test data.

## Security invariants

- Read-only model filesystem views by default.
- No model access to the creator's private records or authentication secrets.
- No direct external writes without deterministic authorization.
- No blind retries of uncertain writes.
- Fail closed when provenance or execution receipts cannot be verified.
- No private-memory-to-public-memory transfer by default.

## Non-goals for the first release

No new background scheduler, multi-agent orchestration, plugin marketplace, social dashboard, or abstract framework layer until a minimal independent engine passes tests with a synthetic agent.
