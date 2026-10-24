# Extraction Plan

## Source and destination

- **Private source / reference agent:** `jomko/ginger`
- **Public destination:** `jomko/ginger-tail`
- **Reference development worktree:** `~/code/ginger-engine-dev` (part of the private Ginger Git history)
- **Live working directory:** `~/code/gingerPurr` (used by systemd; do not switch branches during a wake)

Ginger Tail must have **independent, clean history**. Do not fork or push the private source repository to this public remote. The public repository remains a separate Git repository.

## Sequence

### 0. Public project shell (complete)

Document the identity, scope, safeguards, and boundaries. Do not publish any agent data. The clean-room prototype is licensed under MIT. This does not license or redistribute the private Ginger source.

### 1. Inventory and classify

Classify each candidate module:
- `engine`: reusable logic with no agent identity or world-specific dependencies;
- `adapter`: integration with a model or external world;
- `agent`: Ginger-specific prompts, character, values, memory, and preferences;
- `private`: local state, sessions, tokens, logs, creator data, and private history.

Record imports, filesystem paths, environment variables, write permissions, test fixtures, and licensing provenance.

### 2. Extract a minimal vertical slice (prototype implemented; acceptance pending)

A new, dependency-free local wake and synthetic agent now demonstrate **rest**, persistent state, deny-by-default action gating, and uncertain-write quarantine. They are original prototype code and **not yet** an extraction or replacement of Ginger's production runtime.

The next engineering step is to map this API onto existing private Ginger runtime contracts without maintaining two production implementations. Reusing the prototype unchanged is **not** a goal if that would regress provenance, idempotency, autonomy, or security guarantees.

Require a clear separation between:
- public engine contracts and implementation;
- model/world adapters;
- private agent configuration and state.

### 3. Make Ginger consume one engine

Use a version- or commit-pinned dependency from the private reference installation. During migration, compatibility wrappers may bridge paths, but there must not be two actively maintained copies of core logic.

Keep systemd, guarded wake semantics, authorization policy, and memory locations stable until a separately reviewed host cutover.

### 4. Expand using verified needs

Move attention, independent thoughts, evidence-backed recall, reflection, and authorized actions incrementally. Require targeted regression tests and controlled acceptance on the reference agent.

A Ginger-specific behavior problem does not automatically justify an engine feature. Promote only generally useful capabilities.

### 5. Release

Before the first reusable release:
- confirm the chosen MIT license covers each new module and its dependencies;
- audit content and the complete public Git history for secrets, identifying data, internal paths, and private records;
- verify synthetic fixtures and model/world adapter boundaries;
- provide installation and minimal-run examples;
- document supported Node versions and public API contracts;
- pass automated tests without relying on a live social account.

## Explicit prohibitions

**Do not:**
- import private Ginger Git history, branches, or worktrees into this repository;
- commit `identity/`, `memory/`, `runtime-v3/state/`, real run logs, or auth/session files from Ginger;
- call live Orbitar or a live LLM from repository unit tests;
- auto-switch the live Ginger checkout or systemd service;
- duplicate implementation code indefinitely between repositories;
- make this repository public-ready by merely deleting `.env` files (history and fixtures need review too).

## Definition of done for the first milestone

A synthetic agent runs one bounded offline wake using Ginger Tail without importing code or private files from Ginger; its state persists across invocations, doing nothing is a valid result, and every proposed external action passes through a deterministic policy boundary.
