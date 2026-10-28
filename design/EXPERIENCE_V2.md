# Ginger Tail V2 — interactive cat experience

Status: **Discovery / Art Direction**. Implementation is not started.
Workflow: **`main` only**, no feature branches. Leave the current published `docs/index.html` untouched until the replacement is cohesive.

## Creative thesis

**What happens to an AI agent when nobody is talking to it?**

Do not build a standard SaaS landing page, a clickable diagram, or a button-driven fake chat. Build a small **living technical exhibit**. A visitor should physically explore one mechanical cat, see an event travel through its mechanisms, understand each decision's evidence, and discover that the agent can remember, stay silent, and rest.

The model thinks. The cat stays.

## One cat, three modes (not three separate landing-page sections)

- **ASSEMBLE:** a museum-grade mechanical cat fills 60–70% of the first desktop viewport. It breathes, looks around, and can be rotated, inspected and *mechanically* exploded. Clicking a part reveals a causal connection and an honest module boundary, not a marketing paragraph.
- **AWAKEN:** the same cat sits beside a window. The visitor introduces a bird, triggers a wake, then inspects a trace moving through perception, memory, interests, cognition, decision, and host policy. A private thought may stay private. Sleep is a meaningful outcome.
- **ADOPT:** the same cat opens into an engine-versus-host map with a genuine link to the local Mochi CLI and optional Ollama. This browser demo is not a production resident.

The central cat, camera language and state remain continuous across modes.

## First minute: concrete storyboard

| Time | Visitor action | Visible consequence | Meaning |
| --- | --- | --- | --- |
| 0–5 s | Arrives | Large resting cat and one question: “What happens when nobody is talking to it?” | The cat is the subject, not website chrome |
| 5–15 s | Touches glass capsules on spine | Memory assembly opens: **No bird observations yet** | Memory is inspectable; absence is honest |
| 15–25 s | Clicks a bird on the window | A sourced observation token moves to the cat | The *host* brings in the world |
| 25–40 s | Wakes cat | Attention lens and thought mechanism respond; trace shows no prior match and one new observation | Evidence is not invented |
| 40–50 s | Inspects proposed action | Paw lock denies by default; optional permission permits **a separate synthetic local action** | Proposal ≠ authorization |
| 50–60 s | Lets cat rest, then moves virtual day | Model activity stops; saved observations persist; next bird recalls earlier source | Continuity is not a perpetual model call |

All interactions should be possible by touch/click without relying on hover. A keyboard path is required.

## The physical cat — art direction

**Reference character:** a quiet museum automaton, not fantasy steampunk and not a cute SaaS mascot. Precise scientific craft with real-feeling mechanisms. Material palette: warm porcelain, brushed smoked brass, dark green enamel, amber memory glass, and one ginger-copper segmented tail. Daylight from a window, fine engraved index marks, small high-quality joints, restrained callouts.

Reject arbitrary cogs, goggles, busy pipes, stock-tech gradients, giant marketing cards, and fake activity. A moving part must explain a process.

| Anatomy | Meaning | Honest implementation boundary |
| --- | --- | --- |
| Throat medallion | Identity | **Host-owned**: character, values and persistent configuration |
| Adjustable eye lenses | Attention | `attention-core` interest transitions; world input and persistence supplied by host |
| Amber cartridges in spine | Memory | `memory-continuity` source checks, host-owned storage and verification |
| Chest escapement | Cognition | `cognition-control` / `cognition-journey`; model runner supplied by host |
| Paw lock | Permission | Trusted host authorizes effects; engine checks outcomes and refuses uncertain retries |
| Articulated ginger tail and clock ring | Continuity | Visual metaphor for durable state across wakes; **Tail does not ship a generic scheduler** |

**Three canonical visual states:** whole/resting; exploded/inspectable (recognisably the same cat); active/processing (only data-carrying parts animate). This single model must work at desktop and narrow mobile sizes.

## The first actual interaction: ONE bird, ONE cat, TWO wakes

Do not begin with a general-purpose prompt field.

### World events
- `bird_arrives`: host-visible observation with explicit source id `world:window/bird-01`.
- `wake`: run one scripted, bounded demonstrative cycle.
- `later`: move virtual day forward; time passing **alone must not invent another wake or memory**.
- `inspect`: open a causal node and reveal inputs, source, output, and decision rule.
- `reset`: explicit return to a clean synthetic session.

### State (conceptual)
```text
identity = synthetic cat, independent of engine
clock = virtual day index
observations = [sourceId, kind, day]
memories = [observationId, source, classification: observation-not-fact]
interests = [topic, active|dormant|closed, updatedAt]
thoughts = [source, evidenceStatus, private: true]
proposals = [kind, proposed|denied|confirmed|uncertain]
host = {syntheticLocalSignalAllowed: false}
wake = {number, asleep|observing|thinking|deciding|resting}
trace = [causeId, step, inputIds, outputIds, explanation]
```

**First wake:** bird observed → no prior bird memory → active interest → source-labelled *scripted* private thought → rest OR synthetic proposal → default host denial.

**Second wake:** another bird appears on a new day → retrieve first observation with its source and age → resume/revise the bird interest through explicit deterministic rule → show why the outcome differs. A new host permission can affect **new** proposals only; never retroactively rewrite an earlier denial.

**Required branches:** no evidence = no recollection; rest without action; denied proposal without a fabricated receipt; approved synthetic local receipt only; an uncertain external effect must not be blindly retried in any later real-host version.

## Browser honesty and technical boundaries

Current public Ginger Tail modules use Node.js facilities (e.g. `node:crypto`). GitHub Pages cannot run the Node `runWake` server path directly. V2's first cut is an independently tested **deterministic browser simulation** of relevant contracts and causal transitions, *not* Ginger, not a production autonomous agent, and not an LLM response.

Visible disclosure: **“Interactive model · scripted decisions · no LLM or accounts.”** Browser-only persistence, if introduced, must be labeled as such. No keys, private Ginger data, live posting, or hidden network effects. The authentic runnable demonstration remains Mochi in the repository.

## Technology decision — choose after a spike

Test the **same cat geometry** with two short approaches:

1. Authored **2.5D layered SVG** + CSS/Web Animations and accessible HTML.
2. **Three.js / WebGL 3D** with part selection, orbit, explode/reassemble and fallback.

Compare visual quality, mobile hit targets, spatial clarity, load time, reduced-motion mode, keyboard support, and frame rate on real devices. Prefer 2.5D if 3D would force low-quality geometry or clumsy navigation. Technology must not substitute for an interaction design.

## Acceptance criteria

1. First screen is dominated by a compelling inspectable cat.
2. Six mechanisms can be selected and reassembled, including via touch and keyboard.
3. A bird event changes real simulation state, with a visible and inspectable cause.
4. A later bird recalls earlier sourced evidence; no fabricated facts.
5. Private thought is distinct from sharing intent and from host-permitted action.
6. Rest is a full outcome; no quota-driven posting.
7. Replay/reset never disagrees with the visual trace and state.
8. Permission is default-deny; synthetic effects are visibly synthetic.
9. No private host data or misleading live-AI claims.
10. Visitor can try real local Mochi without reading the whole README.

## Build order on `main`

1. **This brief** (now). No modification of the published website.
2. One consistent cat design in whole / exploded / active states.
3. Small 2.5D vs 3D technical spike, measured on mobile.
4. Deterministic, testable event/state/trace engine with scenario fixtures.
5. Visualize trace through the *same cat*, not text logs in a side panel.
6. Replace `docs/index.html` only when the new experience is worth publishing; use existing GitHub Pages deployment.

**Interaction rule:** every primary gesture must change inspectable state OR reveal a real causal relation. No motion for motion's sake.
