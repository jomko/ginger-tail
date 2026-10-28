# Changelog

The tail is versioned. The cat remains an individual.

## [Unreleased]

Reliability hardening of the offline wake and file store, following independent reviews of v0.1.0.

### Fixed

- **Crash-safe wake lock (H1).** A killed or crashed wake no longer locks its agent out permanently. The lock is created atomically from a complete owner record. It is recovered only when the owner is provably gone (exited, PID reused, or the same machine rebooted), under an exclusive recovery claim. Live owners and uncertain ownership (other host, other PID namespace, non-Linux, malformed or v0.1.0 lock files) fail closed and are left untouched. Diagnostics are available through `WakeLockError.lock` and `store.inspectLock()`.
- **An unresolved action can no longer become executable through persistence failures (H2/M1).** Completion is now two-phase: the receipt is recorded durably while the action still blocks, and only then is the block cleared. Before, one write did both. If its rename succeeded and its directory fsync failed, the visible state permitted new actions while the wake reported `uncertain`.
- **Durable atomic saves (M1).** `save` fsyncs the directory after rename, plus the parents of new state directories, and removes its temporary file on every pre-rename failure. A failed or unsupported directory fsync throws `StateDurabilityError`, with `replaced` saying whether the new state is already visible. `withLock` now runs a durability barrier (a directory fsync) before its callback. Wakes therefore never read merely visible state, and an unsupported filesystem fails before any observation or effect.
- **Reservation not confirmed durable.** If the reservation is renamed into place but its fsync fails, `runWake` returns `reservation_not_durable` instead of throwing. `world.execute` was not called. The reservation is kept (never auto-cleared) and is resolved as `not-executed`.
- **Abandoned recovery claims (L2).** A claim left by a provably dead recoverer is recovered by the same exclusive procedure, up to two nested levels. Live or unprovable claims still fail closed.
- **Audit retention (L3).** Reconciliation decisions (latest 100) and failed attempts (latest 20) are retained separately, so a verifier that keeps failing cannot evict a decision.
- **Cancellation.** A signal aborted before a port call no longer invokes that port or leaks an unhandled rejection.

### Added

- `resolvePendingAction({ identity, store, actionId, verify, resolvedBy })`, an explicit trusted-operator reconciliation. It resolves `confirmed` or `not-executed` only from the verifier's evidence about the exact action id, keeps an audit trail in `state.reconciliations`, and never re-executes.
- `runWake({ signal })` cancels waiting on observe/decide/authorize. It is never honored once the reservation is persisted.
- `WakeLockError`, `StateDurabilityError` (`unsupported`, `replaced`), `store.inspectLock()`, and the related TypeScript declarations (`WakeResult` variants, `PendingReason`, `ReconciliationRecord`).

### Documented

- Exact guarantees and non-guarantees (at most one attempt per action id, never exactly-once), the durability contract for custom `StatePort`s, container PID-namespace behaviour (L1), and a manual lock recovery procedure.

### Compatibility

- State stays at `version: 1`. v0.1.0 state and pending records load, block and can be reconciled. New optional fields (`reconciliations`, `pendingAction.reason/receipt/error`) pass the v0.1.0 validator, so a downgrade can still read them.
- `WakeResult` gains the outcome `reservation_not_durable`, and `acted` may carry `durable: false`. `uncertain` gains `reason` (`execution_failed`, `receipt_invalid`, `completion_not_persisted`), `recorded`, and sometimes `receipt`. Exhaustive `switch`es and whole-object comparisons must update; code that only checks `acted`/`blocked` keeps working.
- Each action wake now performs one more fsynced write (the receipt record), and every `withLock` one directory fsync.
- Lock contention still rejects with a message containing `already locked`, now as `WakeLockError`. A crash-leftover v0.1.0 `wake.lock` is **not** removed automatically; follow the manual recovery procedure.
- On platforms without directory fsync (for example Windows), every `withLock` and `save` now **rejects**. Before, they reported success without that guarantee.
- Automatic stale-lock recovery needs Linux `/proc` and the same PID namespace. After a container restart, or on other platforms, stale locks need manual removal.

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
