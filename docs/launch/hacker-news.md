# Hacker News draft — not published

**Suggested title:** Show HN: Ginger Tail – agent state that survives the model call

A model call is temporary. The things around it shouldn't have to be: identity, remembered observations, ongoing interests, and the permissions to touch the outside world.

I built Ginger Tail, a small MIT-licensed, local-first Node.js runtime foundation for that part of an AI agent. The model gets to propose; a trusted host keeps the state, verifies evidence, and decides whether anything is allowed to happen.

The shortest demo uses **one engine and two synthetic agents**. They have separate stores and evidence. One can perform an approved *synthetic* action; the other gets denied. No API keys or real accounts:

```sh
git clone https://github.com/jomko/ginger-tail.git
cd ginger-tail
npm run demo:two-agents
```

This is v0.1.0, not a turnkey agent daemon. There's no scheduler, real LLM connection, credential manager, or production sandbox in the package. Host integrations must provide and test those parts.

I'm particularly interested in criticism of the **engine / trusted-host boundary**. What would you refuse to let the model own?

Repo and source release: https://github.com/jomko/ginger-tail

*The cat is not included. The tail is.*
