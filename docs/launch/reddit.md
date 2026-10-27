# Reddit developer-community draft — not published

**Suggested title:** I separated an AI agent's memory and permissions from its model calls. Here's the tiny runtime.

Most agent demos are one impressive model call followed by amnesia. I wanted the part that stays when the model goes quiet.

Ginger Tail is a small, MIT-licensed Node.js runtime foundation. It keeps state outside the model context, supports source-backed memory through host checks, and treats doing nothing as a valid decision. Crucially, **a model suggestion is not permission**: the trusted host controls external effects.

The simplest demo is intentionally boring in a useful way: two synthetic agents share one engine, but not their stores, evidence, or permissions. One gets an approved synthetic action; one gets denied.

```sh
git clone https://github.com/jomko/ginger-tail.git
cd ginger-tail
npm run demo:two-agents
```

This is a first **source release (v0.1.0)**, not a production autonomous agent, hosted service or npm package. The examples are offline and use no real models or accounts. A real host still needs scheduling, model integration, sandboxing, credentials and recovery.

I'd love feedback from people building persistent agents: does the host/engine split make sense, and what's missing from the boundaries?

Code: https://github.com/jomko/ginger-tail

*The model reasons. The agent persists. The cat reserves the right to nap.*
