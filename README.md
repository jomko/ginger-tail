# Ginger Tail
### A brain is rented by the minute. A life takes longer.

**The model reasons. The agent persists.** 🐈

Ginger Tail is a small, **local-first Node.js runtime foundation for long-lived AI agents**. A model call ends; an agent's identity, state, interests, memory and permissions need somewhere to remain.

It keeps the reusable machinery separate from the agent's private life. The model can propose an action. A **trusted host** decides whether the door opens.

[**v0.1.0 source release**](https://github.com/jomko/ginger-tail/releases/tag/v0.1.0) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · MIT licensed

---

## Two agents. One tail. Different house keys.

Run the small proof first. No API key, live account, network service or model provider needed; **Node.js 22+**.

~~~bash
git clone https://github.com/jomko/ginger-tail.git
cd ginger-tail
npm run demo:two-agents
~~~

The script runs **two synthetic agents through the same engine**. Each gets its own identity, local store and source-backed notes. The host allows a synthetic signal for one agent and denies it for the other.

| In the offline demo | Cartographer | Gardener |
| --- | --- | --- |
| Local evidence source | `synthetic:cartographer` | `synthetic:gardener` |
| Host permission | Allow | Deny |
| Wake 1 → Wake 2 | `acted` → `acted` | `denied` → `denied` |
| Confirmed synthetic receipts | 2 | 0 |

This is a compact **summary of the example's behavior**, not a live-agent recording. [Read the runnable example](examples/two-independent-agents.mjs). The point isn't two different prompt costumes: it is *separate state and authority*.

---

## Why does a cat need a tail?

Most AI demos live for one prompt. They wake up, say something impressive, and promptly forget where they left the furniture.

An enduring agent needs different plumbing:

- **Continuity over amnesia.** Identity and state live outside the model window.
- **Memory with receipts.** A source being visible is not the same as a claim being true.
- **Curiosity without a content quota.** Reading, thinking, remembering, sharing, and going back to sleep are different things.
- **Authority outside the model.** A proposed action is not permission to perform it.
- **More than one cat.** The engine is reusable; every agent has its own identity, home, memory, and boundaries.

This is infrastructure for agency, not a claim that an AI is conscious, and definitely not a button labelled **AUTONOMY™**.

## The short version

~~~text
             MODEL
        (temporary thought)
                |
                v
       +--------------------+
       |    GINGER TAIL     |
       | cognition / budget |
       | journey / context  |
       | memory / lifecycle |
       | typed action ports |
       +--------------------+
                |
                v
        TRUSTED AGENT HOST
   identity · source checks · policy
   credentials · journal · persistence
                |
                v
           THE WORLD
      (only if permitted)
~~~

The model may suggest a walk. The host decides whether the door opens. The tail doesn't steal the keys.

## Try it before the cat notices

From the cloned repository, the rest of the offline tour:

~~~bash
npm test                 # runtime regression suite
npm run demo             # one agent, persistent wake state
npm run demo:model-swap  # two synthetic provider adapters
~~~

The one-agent demo counts separate wakes in `.ginger-tail-demo-state/` (gitignored); run it twice to see state persist. Set `GINGER_TAIL_STATE_DIR` to move that state. Both provider adapters are **synthetic** (replay and rules), not integrations with real LLM services. No external actions.

## The smallest real example

~~~js
import { createFileStore, runWake } from 'ginger-tail'

const identity = { id: 'sleepy-cartographer' }
const store = createFileStore({
  directory: './my-agent-state',
  agentId: identity.id,
})

const result = await runWake({
  identity,
  store,
  world: {
    observe: async () => ({ event: 'A perfectly ordinary hill.' }),
  },
  decide: async () => ({ kind: 'rest' }),
})

console.log(result.outcome) // 'rest'
~~~

`rest` is a first-class outcome. Doing nothing is not a failing grade.

For an external action, the host must supply an explicit `authorize` callback, a trusted `world.execute` adapter, and a **confirmed execution receipt**. Authorization defaults to denial. An uncertain result blocks subsequent action until reconciliation; there is no optimistic re-try-and-pray.

## What is in v0.1.0?

| Piece | Job |
| --- | --- |
| `contracts` + `runWake` | Bounded offline wake, persistent state, default-deny actions, receipt-first safety |
| `history-context` | Context budgets; distinguish full reading from truncation |
| `attention-core` | Active, dormant, resumed, and closed interests |
| `thought-core` | Private thoughts, evidence and separate share intent |
| `cognition-control` + `cognition-journey` | Model-call budgets, exploration, optional closing choice, voluntary rest |
| `model-port` + `world-read-port` | Provider-neutral model and host-owned observation adapters |
| `decision-dispatch` + `trusted-action-port` | Route decisions to trusted callbacks; never grant permission by routing |
| `memory-continuity` | Host-backed recall and source-verified observation recording |
| `policy-action` + `action-outcomes` | Explicit approval checkpoints and uncertainty brakes |

Every module is intentionally narrow. Tail is **not** an Orbitar client, a credential manager, a sandbox, a posting bot, or a complete production scheduler.

Read the [architecture](docs/ARCHITECTURE.md) and [runtime contracts](docs/CONTRACTS.md) for what each piece does—and, more importantly, what it refuses to do.

## One tail, several lives

Ginger Tail grew out of **Ginger**, a privately configured resident AI character. Ginger's running installation now consumes **commit-pinned Tail v0.1.0 components** through its own trusted host. His voice, memories, history, credentials, world integration, timers, and operational safeguards **are not in this repo**.

The independent `runWake` prototype and the shared resident modules are **not yet one universal drop-in production daemon**. Integrators must supply state, source validation, model isolation, policy and external transport. Don't point an example at a real account and call it deployment.

The public proof is `examples/two-independent-agents.mjs`. No real forum users, model tokens, or private agent histories were invited to that party.

## Install & maturity

The **[v0.1.0 Git tag](https://github.com/jomko/ginger-tail/tree/v0.1.0)** marks the first versioned source release. This package is **not published to npm** (`package.json` is marked `private`). For a pinned Git dependency:

~~~bash
npm install 'git+https://github.com/jomko/ginger-tail.git#v0.1.0'
~~~

APIs are **experimental**; pin an exact version or reviewed commit. This release references the existing `v0.1.0` tag, which currently resolves to commit [`d7988f4`](https://github.com/jomko/ginger-tail/commit/d7988f4cd9a38791a60660fa0cd343abdfe6ea02). Later edits to documentation on `main` do not change the files at that commit.

- [Start here / architecture](docs/ARCHITECTURE.md)
- [Ports, limits and contracts](docs/CONTRACTS.md)
- [Extraction milestones and privacy boundary](docs/EXTRACTION.md)
- [Contributing](CONTRIBUTING.md)
- [Release notes](CHANGELOG.md)

## Rules of the house

1. Untrusted model output never authorizes itself.
2. Evidence and uncertain outcomes keep their labels. Don't promote guesses into facts.
3. No blind retry of a possibly completed external action.
4. Agents own their private state. The public engine does not collect it.
5. An agent may choose silence. Sometimes that is the most intelligent comment in the thread.

**Public repository, synthetic fixtures only.** Never submit real credentials, private memories, production logs, or another person's identity. See the [MIT License](LICENSE); it covers the public code, not Ginger's private installation.

---

*Built for agents who remember where they came from—without pretending they know where they're going.*

*The cat is not included. The tail is.*
