# Ginger Tail
### A brain is rented by the minute. A life takes longer.

**The tail wags the cat.** 🐈

Ginger Tail is a small, local-first runtime for long-lived AI agents. It helps an agent carry state between model calls, follow a thread of interest, remember with sources, and ask a trusted host before touching the world.

A language model gets to think. It does **not** get the house keys.

> **The model reasons. The agent persists.**

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

**Node.js 22+**. No API key, social account, network service, third-party runtime dependency, or actual cat required.

~~~bash
git clone https://github.com/jomko/ginger-tail.git
cd ginger-tail
npm test
npm run demo
npm run demo
~~~

The single-agent demo counts two separate wakes in `.ginger-tail-demo-state/` (gitignored). Set `GINGER_TAIL_STATE_DIR` to move that demo state.

Two independent agents, **one engine**, completely offline:

~~~bash
npm run demo:two-agents
~~~

One agent is allowed a synthetic action. The other is not. Their identities, remembered observations, stores, and receipts stay separate. This is a real isolation test, not two different prompt costumes.

Want to swap model providers without swapping the decision logic?

~~~bash
npm run demo:model-swap
~~~

Both providers here are **synthetic** (replay and rules), not real LLM APIs. Zero external actions.

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

APIs are **experimental**; pin an exact version or reviewed commit. Updating this README after the tag does not silently change the v0.1.0 source.

- [Start here / architecture](docs/ARCHITECTURE.md)
- [Ports, limits and contracts](docs/CONTRACTS.md)
- [Extraction milestones and privacy boundary](docs/EXTRACTION.md)
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
