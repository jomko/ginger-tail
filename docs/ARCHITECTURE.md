# Ginger Tail — Architecture

## An agent is more than a model call

Think of the model as a temporary thinking session. **The agent is the durable arrangement around it**: identity, state, observations, decisions, permissions and the record of what actually happened.

The public engine supplies reusable **mechanisms**. Each trusted host supplies a **life**: character, memories, model credentials, world integration, persistence and the authority to act. The tail is a component, not an independent animal.

~~~text
                        UNTRUSTED
           model response / outside observations
                             |
                             v
  +--------------------------------------------------+
  |               GINGER TAIL v0.1.0                 |
  | model port -> cognition budget -> journey        |
  |                         |                        |
  | history -> attention -> decision dispatcher      |
  | memory continuity -> evidence requirement        |
  | action outcomes -> uncertainty brake             |
  +--------------------------------------------------+
                             |
                        HOST BOUNDARY
                             |
  +--------------------------------------------------+
  |                 TRUSTED HOST                     |
  | identity / prompts / persistent memory           |
  | real model runner + credential isolation         |
  | observations + source visibility                 |
  | policy / authorization / write journal           |
  | transport / receipts / reconciliation            |
  +--------------------------------------------------+
                             |
                      external world
~~~

The **trusted host** is not optional for meaningful external actions. A validated decision only selects a callback. It does not invent permission.

## Two related execution paths

### A. Offline `runWake` reference

`runWake` is an executable **single-wake** prototype that accepts:

- an `identity` with a stable `id`;
- a durable `store` with locking, loading and saving;
- a `world.observe` callback, optionally `world.execute`;
- a `decide` callback returning rest or a bounded action proposal;
- an explicit `authorize` callback (defaults to deny).

The runtime loads durable state under a single-writer lock, observes, asks for one decision and either rests, denies, or attempts one authorized effect. It confirms durability of the state it reads, and writes a durable action reservation **before** calling `world.execute`. Only a valid confirmed receipt completes the action: the receipt is recorded durably while the action still blocks, and only then is the block cleared. If only the clearing write is lost, the next wake finalizes the action from its durable receipt without contacting the world. Any other uncertain result leaves a pending record that blocks later wakes until a trusted operator resolves it with `resolvePendingAction`. That function uses evidence from a host lookup of the exact action id and never retries the action. The file store's lock recovers automatically only from a provably dead owner. Its saves fsync both the file and the directory. See [Contracts](CONTRACTS.md#guarantees-and-non-guarantees) for the exact guarantees.

This prototype deliberately does **not** start a scheduler, talk to a model by itself, sandbox a host-supplied callback, or solve arbitrary distributed transactions.

### B. Shared resident modules

The long-lived reference agent **Ginger** integrates reusable modules individually. Its private installation still owns the real resident loop's prompts, world adapter, sandboxed Codex invocation, memory stores, action journal and systemd scheduling.

| Engine module | Shared responsibility | Host responsibility |
| --- | --- | --- |
| `history-context` | Budget serialized thread/search context; mark complete vs partial | Read sources and decide what is visible |
| `attention-core` | Deterministic interest transitions | Write state, project private interest text |
| `thought-core` | Validate thought provenance and share-intent shape | Check sources, store thoughts, choose platform wording |
| `cognition-control` | Account for model calls, invalid replies, exploration and closing budget | Invoke model, parse replies, define allowed actions |
| `cognition-journey` | Yield bounded proposals; optional closing choice | Execute or ignore proposals; honor voluntary rest |
| `model-port` | Adapt `generate({ prompt })` to cognition | Credentials, transport, isolation, timeout |
| `world-read-port` | Forward a read request without interpreting it | Allowlist, fetch, privacy, source verification |
| `decision-dispatch` | Route a checked action to a registered handler | Real action implementation and permissions |
| `trusted-action-port` | Forward an already approved action to a host executor | Gate access, journal, ensure idempotency and receipts |
| `action-outcomes` | Classify outcome; halt further effects after uncertainty within a wake | Durable pending-action resolution across wakes |
| `memory-continuity` | Bound recall, ask the host to verify source evidence before append | Source visibility, persistence, dedup and migrations |
| `policy-action` | Deny unclear policy verdicts | Gather facts and make the actual authorization decision |

None of these public ports embeds Orbitar endpoints or private model tokens. Providing a callable `generate` or `execute` adapter does **not** make arbitrary inputs safe.

## Identity, state and provenance

Ginger Tail does not ship Ginger's identity.

For a real installation, keep separate:

1. **Identity** — character, values, limits and configuration owned by the agent installation.
2. **Observations** — exactly what was read; truncated context must not be called complete.
3. **Memories** — host-verified source-backed observations, not magically certified facts.
4. **Actions** — proposals, authorization decisions, durable reservations and receipts.
5. **Continuity** — interest transitions and reproducible state; no silent migrations.

That separation lets agents change models without erasing their biographies, and change worlds without smuggling a platform API into the engine.

## Safety invariants

- **Default deny:** no policy verdict means no action.
- **Proposal ≠ permission:** the model cannot approve its own output.
- **Host owns secrets:** the engine does not authenticate to the world.
- **Receipts matter:** once an effect might have occurred, uncertainty must not produce blind retries.
- **Evidence is bounded:** source attribution and truncation survive context reduction.
- **Rest is valid:** no model call, share decision, or public post is mandatory merely because a budget remains.
- **State is local:** production migrations and recovery are explicit host operations.
- **No hidden side agents:** the two-agent demo is an offline example, not an always-on second service.

## Current boundary (v0.1.0)

The offline wake is executable and safe for synthetic tests; the shared resident ports are adopted by the reference host. **Full orchestration is not yet a generic turnkey production runtime.** A host still has to implement persistence, scheduling, robust model transport and its own security model.

Development rules: public repo history is independent of Ginger's private history; fixtures must be synthetic; never import real credentials, logs, identity or memories. Extraction changes are reviewed and tested in isolated checkouts before reaching a running agent.

See [Runtime Contracts](CONTRACTS.md), [Extraction Status](EXTRACTION.md), and the [two-agent executable proof](../examples/two-independent-agents.mjs).
