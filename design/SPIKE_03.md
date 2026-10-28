# Ginger Tail — Spike 03: articulated RYZHYI GLB asset

**Status:** completed local asset prototype; **not production art**. Work on `main` only. Do not replace `docs/index.html` with this asset until browser and visual-quality reviews pass.

## Deliverables produced

- `ryzhyi-v3.glb`: exported mesh with PBR material definitions, **73 geometry nodes** grouped by the `PART__MATERIAL` name prefix, **193,724 triangles**, nine independently selectable physical assemblies.
- `manifest.json`: part-to-node mapping, assembly labels, and exploded-offset vectors.
- `generate.py`: reproducible Python/`trimesh` geometry generator.
- `viewer.html`: Three.js model inspector supporting orbit, zoom, part selection, explosion slider, camera presets.
- `viewer-onefile.html`: the GLB is embedded in HTML; still loads the pinned Three.js library externally.
- `preview-assembled.png` and `preview-exploded.png`: VTK software renders for inspection.
- `README.md`: run/import/rebuild instructions.

### Structural facts verified

| Test | Outcome |
| --- | --- |
| Round-trip GLB parsing using `trimesh` | Pass |
| Nine expected independently named assemblies | Pass |
| 73 material-specific geometry nodes | Pass |
| All nonempty meshes, finite bounds and explosion vectors | Pass |
| Mesh triangle count | 193,724 |
| Assembled & exploded offscreen VTK renders | Produced |
| JavaScript syntax of the interactive viewer | Pass |
| Browser WebGL interaction | **Not verified**: automated Chromium blocked the local test page |

### Assemblies

`HEAD`, `CHASSIS`, `MEMORY`, `COGNITION`, `LEG_FL`, `LEG_FR`, `LEG_RL`, `LEG_RR`, `TAIL`.

### Visual progress and open risks

- More feline silhouette, inset eye assemblies, four paws with individual toes, amber cassettes, geared side core, curved segmented tail with a stylized tuft.
- Still clearly **procedural artwork**, not the highly detailed reference-quality robotic cat. The skull, armor curvature, gear engineering, and actual groomed fur need an original Blender-authored mesh and material pass.
- This GLB has **separately named objects, not an armature or physically modeled hinges**. Explode/reassemble translates independent assemblies without solving mechanical kinematics.
- Material appearance in browser/Blender can differ from VTK's simplified preview lighting.
- No autonomous cognition, model, scheduler, live action, or private Ginger data.

## Next quality gate

1. Verify WebGL loading, camera, picking and explosion in the user's Firefox.
2. Review silhouette and eye placement against the supplied multiview reference.
3. Commission or produce a **purpose-built Blender sculpt / hard-surface mesh** with actual panel topology, joinery, mounts, and groomed tail tuft, reusing current GLB only as a spatial scaffold.
4. Export a final rigged GLB with fixed bounding box, named assemblies, PBR textures and LODs.
5. Only then integrate the honest scripted bird/memory/attention/state scenario into the website.

The asset files were generated as downloadable artifacts within the ChatGPT session; **this document does not imply that the binary GLB or viewer was pushed to the repository**. This phase records their existence and limitations. The live GitHub Pages site is unchanged.
