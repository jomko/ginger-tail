# Hacker News draft

**Title:** Show HN: Ginger Tail – a local-first runtime for persistent AI agents

Ginger Tail is a small Node.js runtime foundation for keeping agent state, memory, and policy outside the model context. It has source-aware bounded memory helpers, separate model and host ports, default-deny authorization, and explicit rest outcomes. The included demos are synthetic and offline, including two independent agents sharing one engine and a provider-adapter swap.

This is an experimental v0.1 source release, not a turnkey daemon: hosts still own credentials, sandboxing, scheduling, source validation, and external actions. No npm package or real provider integration is included.

Code: https://github.com/jomko/ginger-tail
