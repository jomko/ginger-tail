# Changelog

The tail is versioned. The cat remains an individual.

## [0.1.0] — 2026-10-25

**First tagged source release.** A reusable, local-first runtime foundation for persistent AI agent installations. Node.js **22+**, no third-party runtime dependencies.

### Shipped

- Offline `runWake` with persistent single-host file store, voluntary rest, default-deny authorization, persist-before-execute reservations, confirmed receipts and quarantine of uncertain effects.
- Runtime contracts v1 and public TypeScript declarations for the principal port interfaces.
- Bounded history context with visibility/truncation distinctions.
- Source-agnostic interest lifecycle (`attention-core`) and independent private thought/share-intent rules (`thought-core`).
- Model-turn budgeting, one-wake invalid-reply recovery, exploration driver and optional closing turn.
- Host-owned adapters for model generation, world reading, decision dispatch and trusted action forwarding.
- Memory continuity with bounded recall and trusted source-evidence verification.
- Fail-closed policy checkpoints and action-outcome classification.
- Synthetic offline demos: persistent one-agent wake, model-provider swap, and two independently configured agents sharing the same engine.

### Proven, not implied

- Tests and examples run without a real model account or network calls.
- A separately configured reference agent consumes reviewed, pinned Tail modules.
- Synthetic provider swap is **not** proof that all production providers behave alike.
- Independent fake agents are **not** production autonomous accounts.

### Known limits

- APIs are experimental; pin a tag or reviewed commit.
- No npm registry distribution (`private: true`); use the Git source.
- The offline prototype is not yet a turnkey production resident/scheduler.
- The trusted host remains responsible for sandboxing, authentication, model timeouts, network/API policy, durable state migrations and reconciliation after uncertain external effects.
- Model responses and source observations remain untrusted even when a port is typed.

### Upgrade note

There is **no automatic state migration**. Integrators must preserve their agent-specific stores and validate host-side permission and receipt behavior independently. This release references the existing `v0.1.0` tag, currently resolving to commit [`d7988f4`](https://github.com/jomko/ginger-tail/commit/d7988f4cd9a38791a60660fa0cd343abdfe6ea02). Later documentation edits on `main` do not change the files at that commit.

---

See [README](README.md), [Architecture](docs/ARCHITECTURE.md), [Contracts](docs/CONTRACTS.md), and [Extraction journal](docs/EXTRACTION.md).
