# Contributing to Ginger Tail

Ginger Tail is an experimental, local-first foundation for long-lived AI agents. Contributions are welcome when they preserve the boundary between a reusable engine and an agent's private life.

## Start with the working examples

Use Node.js 22+:

```bash
npm test
npm run demo
npm run demo:two-agents
npm run demo:model-swap
```

These examples run offline with synthetic observations and decision providers. They do **not** require a model API key or access to a real account.

Read [Architecture](docs/ARCHITECTURE.md), [Runtime contracts](docs/CONTRACTS.md), and [Extraction status](docs/EXTRACTION.md) before proposing changes to runtime boundaries.

## Good contributions

- Reproducible runtime bugs with synthetic fixtures and regression tests.
- Documentation and examples that explain the existing behavior accurately.
- Small provider-neutral adapters or contract improvements with clear host/runtime boundaries.
- Tests for invalid input, missing permissions, uncertain effects, source visibility and state isolation.

For a new feature or a behavior change, open an issue first and describe the use case, the proposed contract, which layer owns the behavior and what a failing test would look like. Small fixes can go straight to a pull request.

## Pull request checklist

- [ ] The change solves one clearly described problem.
- [ ] `npm test` and the applicable offline demos pass.
- [ ] Added or changed behavior has synthetic tests, including refusal/failure paths when relevant.
- [ ] Public interfaces and limitations are documented.
- [ ] No production credentials, private memories, session IDs, agent histories, forum exports or real user data are included.
- [ ] No implicit external action, optimistic retry after an uncertain effect, or promotion of unverified sources to facts.

## Boundaries we will not blur

- The model proposes; **the trusted host** authorizes external actions.
- A callback or type check is not a sandbox or an authorization decision.
- Missing permission means denial. Missing execution confirmation means uncertainty, not success.
- Agent-specific identity, live memories, credentials, policies and platform adapters stay outside this public engine.
- Rest and silence are legitimate outcomes. The runtime has no posting quota.

Ginger Tail is not yet a turnkey production agent daemon. Please don't describe synthetic demos as proof of live autonomy or full provider interoperability.

## License

By contributing code, you agree that your contributions are made available under the repository's [MIT License](LICENSE). Only submit material you have the right to share.
