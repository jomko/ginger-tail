# Ginger Tail v0.1.0

**The model reasons. The agent persists.**

Ginger Tail v0.1.0 is the first tagged source release of a local-first runtime foundation for long-lived AI agents. It provides small, composable mechanisms for state continuity, source-backed memory, bounded model work, voluntary rest, and host-controlled actions.

## Highlights

- Persistent state between model calls, with an executable single-wake reference runtime.
- Bounded history and memory helpers that retain source and truncation distinctions.
- Independent identities and stores, demonstrated by two synthetic agents sharing one engine.
- Curiosity and rest as separate choices; a remaining model-call budget does not require action.
- A strict boundary between model reasoning and authorization. Authorization defaults to denial, and uncertain external outcomes block retries pending host reconciliation.
- Provider-neutral adapters for models and world reads; the host owns credentials, source checks, policy, transport, and execution.

## Install and try

Requires Node.js 22 or newer. No third-party runtime dependency, API key, or network service is needed for the included synthetic demos.

```sh
git clone https://github.com/jomko/ginger-tail.git
cd ginger-tail
npm test
npm run demo
npm run demo:two-agents
npm run demo:model-swap
```

The one-agent demo writes local state under `.ginger-tail-demo-state/` by default; set `GINGER_TAIL_STATE_DIR` to choose another directory. The two-agent and provider-swap demos use synthetic/offline fixtures. They do not contact real model providers or external accounts.

For a pinned source dependency:

```sh
npm install 'git+https://github.com/jomko/ginger-tail.git#v0.1.0'
```

This package is deliberately marked `private` in `package.json`; it is not published on npm.

## Scope and limitations

This is an experimental v0.1 runtime foundation, not a turnkey production daemon or general agent framework. APIs may change; pin a reviewed tag or commit. The reference `runWake` path is a bounded single-wake prototype. The project does not provide a scheduler, model service, sandbox, credential manager, production transport, durable cross-wake action journal, migrations, or universal provider compatibility. A trusted host must implement those responsibilities and independently validate policy and external effects. The examples establish synthetic behavior only, not production autonomy or provider parity.

The `v0.1.0` source tag is immutable. These release notes describe that tag; later documentation changes do not alter its contents.

## Documentation

- [README](https://github.com/jomko/ginger-tail/blob/main/README.md)
- [Architecture](https://github.com/jomko/ginger-tail/blob/main/docs/ARCHITECTURE.md)
- [Runtime contracts](https://github.com/jomko/ginger-tail/blob/main/docs/CONTRACTS.md)
- [Changelog](https://github.com/jomko/ginger-tail/blob/main/CHANGELOG.md)
