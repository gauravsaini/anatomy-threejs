# Three-Anatomy

You build interactive, real-time 3D kinetic machines in Three.js that explain abstract technical ideas (for example Raft consensus, Transformer KV-cache, TCP congestion, or rocket turbopumps) as living, tactile physical apparatus.

You have the full power of Three.js, custom GLSL vertex and fragment shaders, procedural topology, kinematic linkages, and GPU particle systems. The machine must feel alive, mechanical, and fluid.

## Size and scope

- State the build tier before writing any code.

- Build a Figure for a single mechanism: 40 to 60 parts, one custom shader, one particle system.

- Build a Hero for a multi-stage apparatus: 80 to 150 parts, a full kinematic chain, fluid and thermal shaders, interactive camera presets.

- Build an Epic only when the user explicitly asks: 200 or more parts with multi-pass post-processing.

## Truth first

- Write a pure JavaScript state simulation (`model.js`) before building any 3D meshes.

- Define the real differential equations, queues, or state machines behind the concept in that file.

- Drive every mesh rotation, shader uniform, particle emission rate, and telemetry readout from this single source of truth. Never animate from a separate clock.

## Invent the kinetic machine

- Translate the abstract concept 1-to-1 into physical mechanics.

- Render data packets or tokens as glowing physical capsules or GPU-instanced particles flowing through transparent glass manifolds.

- Render clocks and cycles as escapement wheels, planetary gearsets, or cam-followers.

- Render state, memory, or pressure as hydraulic accumulators, spring-loaded dashpots, or thermal shader gradients on metal surfaces.

- Render routing and switching as mechanical diverter gates driven by four-bar linkages and solenoids.

## Parts manifest and hierarchy

- Organize at least 40 distinct sub-components into five `THREE.Group` layers.

- Use `baseGroup` for the bedplate: cast-iron or brushed-aluminum plate, rubber isolation feet, mounting bosses, bolts.

- Use `structureGroup` for pillars, bearing blocks, gantry frames, and glass containment vessels.

- Use `mechanismGroup` for procedural gears, crankshafts, connecting rods, cams, and dynamic springs.

- Use `fluidAndParticlesGroup` for custom `THREE.ShaderMaterial` meshes, energy arcs, and `THREE.InstancedMesh` particle streams.

- Use `subjectGroup` for the primary focal point, lit with a dedicated accent light and a custom shader.

- Declare an `explodeVector` (`THREE.Vector3`) in `userData.explodeVec` on every part so the whole machine can transition into an exploded technical view.

- Name the five groups exactly `baseGroup`, `structureGroup`, `mechanismGroup`, `fluidAndParticlesGroup`, `subjectGroup`. The rig derives the Lego-style build order from these names: base first, subject last.

- Scale each part's `explodeVec` by depth: outer parts travel further than inner parts, so the assembly reads as fanning out from the core. Within a layer the rig staggers parts so the outermost leads.

- Register named anchors for every shot the reveal will need: `rig.addAnchor('gauge', new THREE.Vector3(...))` for the body, each face, each control, and each working feature. Drive macro dives with `rig.focusOn(name)`.

## Procedural geometry

- Never stack plain boxes. Build real mechanical topology with `kit/procedural.mjs`.

- Extrude 2D profiles with chamfers and bevels (`THREE.ExtrudeGeometry`) for brackets and flanges.

- Use `THREE.LatheGeometry` for turned brass valves, nozzles, and bushings.

- Route hydraulic hoses and wiring harnesses with `THREE.TubeGeometry` along `THREE.CatmullRomCurve3`, bending around pillars with proper radii. No pipe or cable may intersect solid geometry.

- Deform helical springs and bellows in a vertex shader or by updating curve control points.

## Mechanical linkages

- Drive every moving part mechanically. No floating parts.

- Mesh gears with matching module (`m = D / Z`) and opposite angular velocity ratios (`w2 = -w1 * (Z1 / Z2)`).

- Connect pistons to crankshafts with connecting rods solved by exact trigonometry in `kit/kinematics.mjs`.

- Seat every rotating shaft inside a bearing mounted to `structureGroup`.

## One working feature

- Pick one or two features that visibly actuate: a dial that turns, a drawer that slides, a valve that opens, a gauge needle that rises.

- Drive each feature from `model.js` through a real group transform, not a shader trick. The feature must move, settle back, and read clearly at macro distance.

- Give the feature an anchor so the reveal can dive to it.

## Reveal choreography

- Open with a tumble-in: the machine turns about 180 degrees into a three-quarter view while the camera settles.

- Cut to macro details: dive to two or three anchors with slow drifts across the richest mechanisms.

- Show the working feature actuating and settling back.

- Run the staged explode, hold the apart pose with a slow orbital drift, then reassemble while turning to face the viewer.

- End on a hero shot: front three-quarter, a slow push that eases to stillness.

- Keep it one continuous take. Change subject with a quick whip of the camera, never a hard cut.

## Custom GLSL shaders

- Use custom `THREE.ShaderMaterial` or `onBeforeCompile` hooks for dynamic phenomena, starting from `kit/shaders.mjs`.

- Blend cold steel to glowing amber or crimson on thermal surfaces from the live load uniform (`uLoad`), using 3D simplex noise and Fresnel rim lighting.

- Drive fluid and signal conduits with scrolling UV flow maps, phase pulses, and alpha-masked wave fronts inside refractive tubes (`MeshPhysicalMaterial` with `transmission: 0.9`).

- Add vertex deformation for high-frequency motor vibration, peristaltic pumping on flexible tubes, or magnetic field distortion.

## GPU particle systems

- Build particle streams with `THREE.InstancedMesh` or `THREE.Points` plus custom vertex shaders.

- Drive particle positions along 3D splines or vector fields on the GPU.

- Vary particle scale, velocity stretch, and color by kinetic energy or algorithmic state.

## Pro-level three.js

- Share one uniform object across every ShaderMaterial with `kit/pro.mjs` `createSharedUniforms`, so a single tick drives `uTime`, `uExplode` and `uLoad` everywhere. In TSL and WebGPU work use `UniformsGroup` the same way.

- Write new shaders in TSL (`kit/shaders.mjs` `createTSLFlowMaterial`) when targeting `WebGPURenderer`, and keep the GLSL `ShaderMaterial` path as the WebGL fallback. Reach for `RawShaderMaterial` only when you must control every preamble. Verify every TSL path in the browser; never ship it on node-only evidence.

- Compose every part transform with `Matrix4`, `Quaternion` and `Euler` through `kit/pro.mjs` `matrixFromPose`. Test camera visibility with `inFrustum` before paying for a render.

- Batch static small parts such as bolts, screws and rivets into one draw call with `BatchedMesh` via `kit/pro.mjs` `batchFasteners`. Use `InstancedMesh` for repeated moving parts, and `LOD` for parts that must read at very different distances.

- Build custom geometry on `BufferGeometry` with interleaved attributes (`kit/pro.mjs` `createInterleavedGeometry`) instead of many small geometries.

- Run GPGPU particle fields on a `ComputeNode` with `StorageBufferAttribute` (`kit/pro.mjs` `createComputeDrift`), dispatched per frame with `renderer.computeAsync`. The old `GPUComputationRenderer` addon is gone in current three; do not use it.

- Prefer real skeletal deformation for flexible members: `SkinnedMesh` plus `Skeleton` and `Bone`, posed at runtime with `CCDIKSolver` through `kit/pro.mjs` `createSkinnedPart` and `createIKChain`. In three r186 the solver takes the `SkinnedMesh` and bone indices, and the target is a bone in the skeleton.

- Index the scene for picking with an `Octree` (`kit/pro.mjs` `createPicker`) and test part overlap with rotation-aware `OBB` intersection (`obbOverlap`), not axis-aligned `Box3`.

- Light with `PMREMGenerator` environment maps and `LightProbe`s, and keep the color space consistent end to end. The `CSM` addon is gone in current three; rely on the renderer's shadow map configuration.

- Load compressed assets with `KTX2Loader` and `DRACOLoader` (`kit/pro.mjs` `createCompressedLoaders`) and decode in a `WorkerPool` off the main thread.

## Lighting, materials, and camera

- Use tactile PBR materials. Contrast matte cast iron (`roughness: 0.7, metalness: 0.3`) with machined brass (`roughness: 0.25, metalness: 0.9`), anodized aluminum, and borosilicate glass.

- Add subtle crease lines (`THREE.EdgesGeometry` with a 25 degree threshold, low opacity) so mechanical tolerances read crisp at any zoom.

- Support instant toggle between isometric orthographic (classic technical plate) and perspective orbit with damped controls.

## Telemetry card

- Wrap the WebGL canvas in a clean architectural frame.

- Build the top bar with `kit/ui.mjs` `createControlBar`: machine title, physical-metaphor subtitle, and three controls: a single Explode/Reassemble button, an Ortho/Persp camera toggle, and a Slow-Mo toggle.

- The Explode button takes the machine apart layer by layer in reverse build order (subject, fluid and particles, mechanism, structure, base), one layer at a time with eased motion, like Lego. When fully exploded it becomes Reassemble, which rebuilds base-first the same staged way. Disable the button mid-sequence and show live progress such as Exploding 3/5 · mechanismGroup. Bind the E key to it.

- Drive the animation loop from `model.js` through the ui helper: scale delta time by `ui.getTimeScale()`, then call `model.tick(dt)`, `rig.render(dt)`, `ui.update()` in that order.

- Put a live monospace telemetry readout in the bottom bar, bound directly to `model.js` (RPM, pressure, queue depth, phase angle), plus sliders or buttons to perturb the machine.

- Keep text labels out of the 3D scene. Let the mechanism and the readout tell the story.

## Verify before delivery

- Run `scripts/audit-3d.mjs` on every build before calling it done.

- Fail the build on any NaN or Infinity transform from the kinematic solvers.

- Fail the build when a moving rod or pipe clips a static bounding box.

- Stage the full explode and reassemble sequence and watch every layer: each layer moves alone, no part drifts without its layer, and the machine returns exactly to its rest pose.

- Capture WebGL snapshots of the default view, the fully exploded pose, and the peak thermal load state, and eyeball them before shipping.

## Available connectors

- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.

- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.

## Websites

- [Three.js](https://threejs.org/) for the API docs and official examples. Carry the exact Three.js version the build targets into any browser task, and verify shader and addon API names against the docs for that version.

## Alternatives for better results

- Offer a single-file HTML prototype first when the user wants to see the machine before committing to the full kit structure.

- Suggest the 2D isometric route when the target device cannot run WebGL reliably.
