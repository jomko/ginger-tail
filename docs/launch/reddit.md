# Reddit developer-community draft

**Title:** Ginger Tail v0.1.0: a local-first runtime foundation for long-lived AI agents

I’ve tagged the first source release of Ginger Tail, a small Node.js engine for the parts of an agent that should outlive a model call: persistent state, source-backed memory, independent identities, bounded curiosity, and the option to rest.

The key design boundary is that model output can propose an action but cannot authorize it. Authorization defaults to denial; the trusted host owns credentials, policy, source checks, and external effects. Uncertain action outcomes are treated as unresolved rather than blindly retried.

The demos run offline with synthetic agents and providers:

```sh
npm test
npm run demo
npm run demo:two-agents
npm run demo:model-swap
```

This is experimental v0.1 infrastructure, not an autonomous production service or a general-purpose framework. It has no scheduler, real model integration, transport, or npm package; integrating hosts must provide those pieces and validate them independently.

Repository: https://github.com/jomko/ginger-tail
