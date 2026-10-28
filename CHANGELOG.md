# Changelog

The tail is versioned. The cat remains an individual.

## [Unreleased]

Reliability hardening of the offline wake and file store, following an independent review of v0.1.0.

### Fixed

- **Crash-safe wake lock (H1).** A killed or crashed wake no longer locks its agent out permanently. The lock is created atomically from a complete owner record. It is recovered only when the owner is provably gone (exited, PID reused, or the same machine rebooted), under an exclusive recovery claim. Live owners and uncertain ownership (other host, other PID namespace, non-Linux, malformed or v0.1.0 lock files) fail closed and are left untouched. Diagnostics are available through `WakeLockError.lock` and `store.inspectLock()`.
- **Receipts survive persistence failures (H2).** If an effect is confirmed but completion cannot be saved, `runWake` now returns `uncertain` (`reason: 'receipt_not_persisted'`) with the receipt, and stores the receipt in the pending record when it can. Before, it threw and the receipt was lost. An uncertain record that cannot be saved also returns `uncertain` (`recorded: false`) instead of throwing.
- **Durable atomic saves (M1).** `save` now fsyncs the directory after rename, plus the parents of newly created state directories. It removes its temporary file on every failure. Unsupported or failed directory fsync throws `StateDurabilityError` instead of silently weakening durability.

### Added

- `resolvePendingAction({ identity, store, actionId, verify, resolvedBy })`, an explicit trusted-operator reconciliation that resolves `confirmed` or `not-executed` only from the verifier's evidence about the exact action id. It keeps an audit trail in `state.reconciliations` (latest 100) and never re-executes.
- `runWake({ signal })` cancels waiting on observe/decide/authorize. It is never honored once the reservation is persisted.
- `WakeLockError`, `StateDurabilityError`, `store.inspectLock()`, and the related TypeScript declarations.

### Compatibility

- State stays at `version: 1`. v0.1.0 state and pending records load and can be reconciled. New optional fields (`reconciliations`, `pendingAction.reason/receipt/error`) pass the v0.1.0 validator, so a downgrade can still read them.
- `uncertain` wake results gain `reason` and `recorded` (and sometimes `receipt`). Consumers that deep-compare the whole result object must update.
- Lock contention still rejects with a message containing `already locked`, now as `WakeLockError`. A crash-leftover v0.1.0 `wake.lock` is **not** removed automatically; delete it by hand once no wake is running.
- `save` now **rejects** on platforms without directory fsync (for example Windows). Before, it reported success there without that guarantee.
- Automatic stale-lock recovery needs Linux `/proc`. Elsewhere, stale locks still need manual removal, as before.

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
