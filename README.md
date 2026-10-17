# anatomy-threejs

An agent skill for building interactive, real-time **3D kinetic machines in Three.js** that explain abstract technical ideas (Raft consensus, Transformer KV-cache, TCP congestion, rocket turbopumps) as living, tactile physical apparatus.

Procedural gears, inverse-kinematics linkages, custom GLSL vertex/fragment shaders, and GPU-driven particle systems — wrapped in a framed telemetry card with an exploded-view toggle.

Inspired by [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) (truth-first simulation, physical analogies, exploded view, live telemetry), rebuilt for Three.js WebGL/WebGPU instead of the 2D SVG painter's algorithm.

## Structure

```
anatomy-threejs/
├── SKILL.md                  # Core agent instructions and workflow (skill short name: anatomy)
├── skill.yaml                # Skill descriptor
├── kit/
│   ├── rig.mjs               # Scene, ortho/persp camera, lighting, staged explode engine
│   ├── ui.mjs                # Telemetry card: Explode/Reassemble button, camera + slow-mo
│   ├── pro.mjs               # Pro utilities: shared uniforms, BatchedMesh, LOD, OBB,
│   │                         #   Octree picking, SkinnedMesh + CCD IK, KTX2/DRACO loaders,
│   │                         #   WebGPU compute particles, post-processing chain
│   ├── procedural.mjs        # Gears, dynamic springs, routed tubes
│   ├── kinematics.mjs        # Slider-crank and four-bar linkage solvers
│   └── shaders.mjs           # Fluid-flow GLSL + TSL, GPU spline particle systems
└── scripts/
    └── audit-3d.mjs          # NaN sweep, bounding-box collision, WebGL snapshots
```

## Quick start

```bash
npm init -y
npm install three
```

Kit verified against three 0.186.1. Notes for this version: `GPUComputationRenderer` and the `CSM` addons are removed (use WebGPU `ComputeNode` and the renderer shadow map instead); `CCDIKSolver` takes the `SkinnedMesh` plus bone indices with the target as a skeleton bone; `BatchedMesh` needs `addGeometry` then `addInstance` per copy (`setMatrixAt` flags its texture internally); `CubeRenderTarget` and `StorageBufferAttribute` live in `three/webgpu`.

Then in the agent workflow:

1. Write `model.js` — the pure-JS truth simulation (differential equations, queues, state machines).
2. Import the kit: `import { createAnatomyRig } from './kit/rig.mjs'` and friends.
3. Build the five groups (`baseGroup`, `structureGroup`, `mechanismGroup`, `fluidAndParticlesGroup`, `subjectGroup`), registering every part with an `explodeVector`.
4. Drive all uniforms and telemetry from `model.js`. Wire the frame with `kit/ui.mjs`: the Explode/Reassemble button takes the machine apart layer by layer in reverse build order (subject first, base last), then rebuilds it base-first — like Lego.
5. Run the audit before shipping:

```bash
node scripts/audit-3d.mjs --manifest parts.json --snapshot http://localhost:5173
```

## Notes

- Gear outline starts with an explicit `moveTo` (no stray edge from the origin).
- Kinematic solvers clamp `asin`/`acos` domains and guard `sqrt`, so sweeps stay finite — the audit verifies this over thousands of samples.
- `createSplineParticleSystem` clamps instance scale above zero to avoid degenerate matrices.
- Snapshot states assume the build reads `?explode=1` and `?thermal=peak` query flags; adapt to your harness.

## License

MIT — do what you want, keep the notice.
