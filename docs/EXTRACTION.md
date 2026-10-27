# Extraction journal · where the tail came from

Ginger Tail is a **new public codebase with independent Git history**, not a mirror of the privately configured reference agent, Ginger.

We have been extracting **reusable mechanisms**, not copying a cat. Character, personal memory, creator context, private data, credentials, Orbitar-specific transports and live runtime state must remain on the host side of the boundary.

## Milestones

| Step | Result at v0.1.0 |
| --- | --- |
| 1 · Public shell | Independent repository, MIT licensing for public code, synthetic-only fixtures |
| 2 · First offline wake | Durable local state, voluntary rest, default-deny actions, action reservation + receipt |
| 3 · Context, interest and thought | Shared context budget, attention lifecycle and independent thought contracts |
| 4 · Cognition and adapters | Turn budgets, journey driver, provider/model port, read-only world port, host dispatch and action outcomes |
| 5 · Memory & continuity | Host-backed recall and source-verification checkpoint |
| 6 · Policy & actions | Explicit trusted policy check and action execution forwarding; host keeps journals and final authority |
| 7 · Second agent | Two independent synthetic agents, one reusable engine; isolated states, sources, approvals and receipts |
| 8 · v0.1.0 | Versioned source tag, offline tests, examples and integration into reference host |

**Status: shipped as a first source release, not “full production engine complete.”**

The public source tag is `v0.1.0`. The reference installation uses pinned engine modules, while retaining its existing resident orchestrator, model sandbox, scheduler, memory stores and platform adapter. Migration is **incremental**, module by module; nobody replaced a living agent's identity with a demo fixture.

## Why the boundary matters

Ginger Tail may contain:
- original, provider-neutral source modules;
- synthetic tests, public contracts and standalone examples;
- architecture and release documentation.

Ginger Tail must **never** contain:
- private Ginger repository history or raw source-tree copies;
- real agent identity, personal memories or private discussions;
- session IDs, auth files, model tokens, state folders or runtime logs;
- live forum exports, user data or real-world side-effect fixtures;
- a new public agent that silently writes to the reference agent's account.

A successful private host acceptance test **does not transfer its data into the public repo**. Keep traces, secrets and production diagnoses local.

## What the tag demonstrates

- `npm test`: synthetic, offline regression suite.
- `npm run demo`: one agent, persistent local wake counter, voluntary rest.
- `npm run demo:model-swap`: two synthetic decision providers through unchanged cognition.
- `npm run demo:two-agents`: independent fake agents exercising isolation and permissions.

It does **not** demonstrate two autonomous social-media accounts or production interoperability with an arbitrary hosted LLM.

## How future extraction should work

1. **Identify one generic seam.** Document the caller, inputs, outputs, threat boundary and existing host behavior.
2. **Classify its data.** Engine mechanism? Adapter? Agent-specific? Private?
3. **Write a clean public implementation.** No copying private history into the public Git repository.
4. **Prove with fake identities and sources.** Include denial paths, malformed output, uncertainty and no-retry behavior.
5. **Integrate with the host through a pinned commit or tag.** Do not replace a live worktree to “see what happens.”
6. **Accept separately on the host.** Typechecks, unit tests, compatibility checks, state backup, measured wake.
7. **Record limitations.** If a real model runner times out, that is not automatically a new Tail feature.

A public runtime bug gets a public runtime fix. A private transport, platform or credential problem stays with the host unless there is a proven reusable abstraction.

## Release and migration rules

- The release references the existing `v0.1.0` tag, currently resolving to commit [`d7988f4`](https://github.com/jomko/ginger-tail/commit/d7988f4cd9a38791a60660fa0cd343abdfe6ea02). Later documentation changes on `main` do not change the files at that commit.
- The package is Git-installable, not published to the npm registry.
- API contracts are experimental, not promised stable across future minors.
- No migration of private memory happens by installing the engine.
- No action becomes authorized because the caller switched to Tail.
- No hidden retries after unknown side effects.
- Explicit rollback points are required before changing a live agent.

**Success is not “the entire private agent moved into a public package.”** Success is one trustworthy implementation of reusable capabilities, consumed by independent agents without leaking their lives.

The tail should be portable. The cat's diary should not be.
