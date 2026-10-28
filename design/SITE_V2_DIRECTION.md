# Ginger Tail website — simplified visual direction (28 October 2026)

**Decision:** stop 3D asset experiments for the public site. Use the approved portrait of the orange mechanical cat as a high-quality photographic hero image. The site must explain Ginger Tail, not demonstrate an ambitious model viewer.

## The three real layers

- **MODEL — temporary reasoning.** Receives a bounded context, returns a proposal, and ends. Does not own identity or permissions.
- **GINGER TAIL — reusable continuity machinery.** Interest transitions, source-backed memory continuity, bounded cognition, thought/share separation, and action-outcome checks. This is not itself a complete scheduler or hosted pet.
- **TRUSTED HOST — persistent life and authority.** Identity, state store, world observations, secrets, policy, authorization, external actions and execution receipts. A model proposal does not authorize itself.

## Visual treatment

One original RYZHYI illustration, minimally animated (very slow movement and conceptual signal highlights), with exactly three selectable hotspots/cards. No WebGL, no procedural geometry, no invented mechanical sprite art. The portrait is a visual metaphor: do not pretend the pictured physical parts mechanically implement the software.

## The one-minute explanation

A bird visits on day one. A temporary model call processes the observation. Ginger Tail mechanisms support continuity; the trusted host persists a source-backed record and defaults to denying unauthorized external effects. On day two, a new model call can see the earlier observation. Then the cat rests again.

This interactive browser walkthrough must clearly say **scripted / not a live AI**. It should retain its virtual day in browser storage only, not claim durable server-side state. Keep controls minimal: select one of the three layers, wake, wake again, reset.

## Acceptance criteria

1. Real cat portrait remains the focal point, large and beautiful.
2. Users understand **Model → Tail → Host** without scrolling through a generic SaaS page.
3. Clicking each layer reveals a true responsibility boundary.
4. A two-wake story shows **model call ends; memory remains**.
5. Motion is subtle, disabled for reduced-motion preference.
6. No external JS runtime, model keys, private Ginger data, or misleading claims.
7. Responsive mobile access through equivalent labeled buttons.
8. Real Mochi local-run commands remain available.
9. Replaces `docs/index.html` only when the image asset is committed and site preview is approved.
10. Continue on `main`; no feature branches.

The previous 3D spikes remain historical technical studies, **not the product direction**. The local proof-of-concept uses the supplied image embedded into one self-contained HTML file; it has not been deployed to GitHub Pages.
