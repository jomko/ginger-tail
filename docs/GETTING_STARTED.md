# Getting Started

Run the examples locally, try Mochi with or without a local model, and see what a host must provide before using the experimental runtime in another project.

[Back to the README](../README.md) · [Architecture](ARCHITECTURE.md) · [Runtime contracts](CONTRACTS.md)

## Requirements

- Node.js 22 or newer.
- No API key or third-party runtime package is needed for the deterministic examples.
- Optional: [Ollama](https://ollama.com/) and a model installed locally for Mochi’s model-backed mode.

## Clone the repository

```bash
git clone https://github.com/jomko/ginger-tail.git
cd ginger-tail
```

The example commands below run directly with Node.js; there is no root `npm install` step.

## Meet Mochi offline

```bash
npm run demo:cat
```

The default mode is deterministic, not a language model. Type a message, ask “What do you remember?”, use `/sleep` to let Mochi rest, or `/quit` to leave. Start it again and the local conversation is still there. No API key is needed.

Mochi stores its conversation and wake state in `.ginger-tail-cat-state/` under the current directory. Git ignores this directory. To choose another location:

```bash
GINGER_TAIL_CAT_DIR=./mochi-state npm run demo:cat
```

The demo keeps up to twelve conversation messages. The offline reply is a small deterministic response to the current message and visible history; it does not pretend to be an LLM. The demo writes only to its local conversation file; don't enter secrets or connect it to a real social account.

## Optional Ollama mode

With Ollama running locally, install the example model and set `CAT_MODEL` when launching Mochi:

```bash
ollama pull llama3.2:3b
CAT_MODEL=llama3.2:3b npm run demo:cat
```

The Ollama mode sends up to the last six conversation exchanges to the selected local model, trimming whole older messages to stay within the wake context budget. It has no model API key, tools or external action integration. If Ollama listens at a non-default base URL, set `CAT_OLLAMA_URL`; the default is `http://127.0.0.1:11434`.

Mochi writes replies only to its local conversation file. It is a small example, not a hardened resident installation: it has no automatic state migration, journal reconciliation or production safeguards.

## Available demos

- `npm run demo:cat` — Mochi, deterministic by default; optional local Ollama mode above.
- `npm run demo` — one synthetic agent and a persistent wake counter in `.ginger-tail-demo-state/`. Run it twice to see the counter persist. Set `GINGER_TAIL_STATE_DIR` to use another directory.
- `npm run demo:model-swap` — two synthetic model adapters through the same cognition flow. It uses temporary local state and makes no provider calls.
- `npm run demo:two-agents` — two synthetic identities with separate stores, memories and host decisions. It creates temporary state and removes it when finished.

Run the offline regression suite with:

```bash
npm test
```

## Install the experimental source release

Ginger Tail is not published to npm. To install the existing source tag as a Git dependency:

```bash
npm install 'git+https://github.com/jomko/ginger-tail.git#v0.1.0'
```

The v0.1.0 APIs are experimental. Pin a reviewed tag or commit; later changes on `main` do not change the files at that tag. The existing `v0.1.0` tag currently points to [`d7988f4`](https://github.com/jomko/ginger-tail/commit/d7988f4cd9a38791a60660fa0cd343abdfe6ea02).

## A minimal host wake

After installing the Git dependency, a host can run one bounded wake with a local store:

```js
import { createFileStore, runWake } from 'ginger-tail'

const identity = { id: 'my-agent' }
const store = createFileStore({ directory: './state', agentId: identity.id })

const result = await runWake({
  identity,
  store,
  world: { observe: async () => ({ event: 'A bird at the window.' }) },
  decide: async () => ({ kind: 'rest' }),
})

console.log(result.outcome)
```

`runWake` is a single-wake prototype, not a daemon or scheduler. A host that supports external effects must provide explicit authorization and a trusted executor; the default is deny. Model proposals and outside observations remain untrusted. The host also owns credentials, source checks, durable storage, state migrations and the evidence for reconciling an uncertain result (`resolvePendingAction` requires a trusted verifier; see [Contracts](CONTRACTS.md#reconciling-a-pending-action)). `createFileStore` is local single-host storage, not a distributed transaction system; an uncertain external effect must be reconciled before another attempt. The examples are synthetic and should not be connected to live accounts.

Read the [architecture](ARCHITECTURE.md) and [runtime contracts](CONTRACTS.md) before connecting a model or world adapter. The [extraction notes](EXTRACTION.md) explain the boundary between reusable code and an agent’s private installation.
