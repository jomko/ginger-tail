# Ginger Tail V2 — Technical spike 01: articulated 2.5D cat

**Status:** tested local browser prototype; this is an interaction-feasibility study, **not** the replacement website. **Worktree policy:** `main` only. The published `docs/index.html` stays unchanged.

## What is technically proven

An independent, hand-authored SVG mechanical cat can be split into six distinct rigs:
- **Attention** — head, eye lenses, and optical assembly.
- **Memory** — five amber cartridges and their mounting rack.
- **Cognition** — removable chest plate with a separate working escapement.
- **Identity** — throat medallion.
- **Permission** — articulated foreleg and mechanical paw lock.
- **Continuity** — jointed copper tail.

The prototype supports:
1. Selecting any of the six rigs with mouse, touch, or keyboard; **a selected part detaches** from its home anchor and can be reseated.
2. Exploding all six parts and reassembling them with easing and visible conceptual tethers.
3. A visual signal passing through the six mechanisms, highlighting participating pieces in order.
4. Responsive stage framing with mobile-first controls and a reduced-motion fallback.
5. Module descriptions that distinguish reusable Tail mechanics from trusted host responsibilities.

Local browser checks ran in Chromium at **1440, 390, and 320 CSS-pixel widths**. Selection, detach/reseat, explode/reassemble, JS error checks and page overflow all passed. This is a *technical* smoke test; no full usability or performance benchmark has been done.

## Important limitation

The original generated concept illustration is **one flattened raster image**, not six rigged assets or a 3D mesh. It cannot be directly rotated and reassembled into a convincing moving automaton. The spike therefore uses **new vector geometry** and is much more stylized than the museum-quality concept art. It validates controls and part boundaries, **not** final visual fidelity.

The "Run signal" control is **only visual choreography**: no AI, `runWake`, memory retrieval, permission decision, or real-world effect is being executed. It must never be presented as evidence of agent behavior.

## Next decision / design gate

**Feasibility conclusion:** 2.5D passes the basic independent-part interaction gate, but does not yet pass the intended visual-quality bar.

Before replacing the live page, choose how the cat will be authored:
- **High-resolution layered illustrated 2.5D art**, manually separated and rigged; best for authored look, accessible hotspots, and fast GitHub Pages delivery.
- **Original 3D mesh plus an interaction rig**, not an AI-generated single PNG; best for genuine rotation and spatial exploration but substantially higher asset-production cost.

A simple procedural 3D cat should **not** automatically win over carefully illustrated 2.5D. Check whether we can achieve the chosen material finish, correctly assembled/exploded silhouette, clear part selection, and responsive behavior on both desktop and phone.

## What is intentionally *not* implemented

No user-configured pet or persisted simulated life, no timeline, no bird/world input, no model provider, no sources or memory, no live posting. The next product phase is the **scripted event-to-state engine** described in [EXPERIENCE_V2.md](EXPERIENCE_V2.md), connected to the chosen visual rig.

**Bottom line:** independent moving parts work. The **art asset pipeline**, rather than the animation code, is now the critical risk.
