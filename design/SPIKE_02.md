# Ginger Tail — Spike 02: RYZHYI procedural 3D blockout

**Status:** standalone technical prototype created and tested locally. The published `docs/index.html` was **not replaced**. Development stays on `main`, without feature branches.

## What the prototype actually provides

A browser-native, dependency-free **WebGL2 scene with real 3D geometry**, authored to approximate the supplied orange mechanical cat reference. This is **not** a 2.5D illustration and does not claim photorealistic model quality.

- 360° orbit camera; mouse drag, keyboard arrows, scroll zoom, touch rotation and two-finger pinch.
- Camera presets: three-quarter, side, front and top.
- An `Explode` control and continuous 0–100% separation slider.
- Six logical subsystems: head, chassis, memory, cognition, legs and tail.
- **Nine physical geometry subassemblies:** head; chassis; memory cartridges; cognition gears; four independent legs; segmented tail.
- Pointer picking using a color-ID framebuffer; accessible selection through the HTML component list.
- OBJ + MTL geometry export for further work in Blender.
- No API keys, external JavaScript modules, remote calls, or private Ginger data.

### Geometry and evidence

The procedural model consists of **38,636 triangles**. It was validated by independent geometry extraction, finite-coordinate checks, expected component identities, and a successful `trimesh` import of the exported Wavefront files. Local software projection confirms a recognizable assembled feline silhouette.

Static HTML/JS checks passed; Chromium DOM/interaction smoke checks passed at 1440px, 390px, and 320px with no horizontal overflow. The container's Chromium **does not provide a WebGL2 context** even with software-rendering flags, so an actual GPU screenshot and full end-to-end WebGL interaction verification remain uncompleted. Do not represent those as tested.

The WebGL2 path uses a custom vertex/fragment shader, depth testing, real perspective projection and nine separate GPU buffers. The fallback explicitly reports unavailable graphics support.

## Boundary

This only proves a first **riggable 3D structural blockout**. It does **not** implement the life simulation, a real model call, a consciousness claim, accurate PBR materials, a fully consistent Blender rig, or any external world action.

The physical assemblies are metaphors: the tail is not an independent decision-making engine, and identity and authorization remain host-owned.

## Next criterion

Before replacing the live site: validate the WebGL rendering on a normal desktop browser, check front/top/side geometry and selecting via raycast, then decide whether to refine the procedural mesh or replace it with a curated Blender-authored asset. Keep the site's visual narrative anchored in real state transitions (bird → memory → attention → policy → rest) rather than animated gears alone.

See [EXPERIENCE_V2.md](EXPERIENCE_V2.md) for the approved experience and simulation boundaries.
