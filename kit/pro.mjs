// kit/pro.mjs — pro-level three.js utilities for the anatomy skill.
//
// Verified against three 0.186.1. Every function is tagged:
//   TESTED      runs headless in node (covered by the kit test suite)
//   BROWSER-ONLY needs a real GPU; imports verified, behavior must be
//               confirmed in the browser before shipping
//
// WebGPU-only modules ('three/webgpu', 'three/tsl') are imported dynamically
// inside their functions, so this file stays importable in node.

import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { OBB } from 'three/addons/math/OBB.js';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ---------------------------------------------------------------------------
// 1. Shaders & materials
// ---------------------------------------------------------------------------

// TESTED. One shared uniform object for every ShaderMaterial: a single source
// of truth for time, explode and load. Link it into each material so a single
// tick() drives the whole machine.
export function createSharedUniforms() {
  const uniforms = {
    uTime: { value: 0 },
    uExplode: { value: 0 },
    uLoad: { value: 0 },
  };
  return {
    uniforms,
    tick(dt) { uniforms.uTime.value += dt; },
    setExplode(v) { uniforms.uExplode.value = v; },
    setLoad(v) { uniforms.uLoad.value = v; },
    link(material) {
      Object.assign(material.uniforms, uniforms);
      return material;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. 3D math & transforms
// ---------------------------------------------------------------------------

// TESTED. Compose a Matrix4 from a pose descriptor. Pass euler as [x, y, z]
// radians or a THREE.Quaternion.
export function matrixFromPose({ position = [0, 0, 0], euler = null, quaternion = null, scale = [1, 1, 1] } = {}) {
  const q = quaternion
    ? quaternion.clone()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(...(euler || [0, 0, 0])));
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    q,
    new THREE.Vector3(...scale)
  );
}

// TESTED. Frustum test for a world-space point against a camera.
export function inFrustum(point, camera) {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );
  return frustum.containsPoint(point);
}

// ---------------------------------------------------------------------------
// 3. Instancing, batching, LOD
// ---------------------------------------------------------------------------

// TESTED. Merge many small static parts (bolts, screws, rivets) into one draw
// call. items: [{ geometry, matrix }]. All geometries must share attributes.
export function batchFasteners(items, material) {
  if (!items.length) throw new Error('batchFasteners needs at least one item');
  const geo = items[0].geometry;
  const batch = new THREE.BatchedMesh(items.length, 4096, 8192);
  const geoId = batch.addGeometry(geo);
  for (const { geometry, matrix } of items) {
    if (geometry !== geo) throw new Error('batchFasteners: all items must share one geometry (clone it per size class)');
    const id = batch.addInstance(geoId);
    batch.setMatrixAt(id, matrix); // flags the matrices texture internally
  }
  const mesh = new THREE.Mesh(batch.geometry, material);
  mesh.add(batch);
  return batch;
}

// TESTED. Level of detail: levels = [{ object, distance }], near to far.
export function createLODPart(levels) {
  const lod = new THREE.LOD();
  for (const { object, distance } of levels) lod.addLevel(object, distance);
  return lod;
}

// ---------------------------------------------------------------------------
// 4. Low-level buffers
// ---------------------------------------------------------------------------

// TESTED. Interleaved position+color buffer -> BufferGeometry. positions and
// colors are flat arrays of equal vertex count.
export function createInterleavedGeometry(positions, colors) {
  const count = positions.length / 3;
  const interleaved = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    interleaved.set(positions.slice(i * 3, i * 3 + 3), i * 6);
    interleaved.set(colors.slice(i * 3, i * 3 + 3), i * 6 + 3);
  }
  const buffer = new THREE.InterleavedBuffer(interleaved, 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geo.setAttribute('color', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  return geo;
}

// ---------------------------------------------------------------------------
// 5. Spatial indexing & raycasting
// ---------------------------------------------------------------------------

// TESTED. Oriented bounding box. rotation is a Matrix3 (identity = axis aligned).
export function createOBB(center, halfSize, rotation = new THREE.Matrix3()) {
  return new OBB(new THREE.Vector3(...center), new THREE.Vector3(...halfSize), rotation);
}

// TESTED. True OBB-vs-OBB overlap test (rotation-aware, unlike Box3).
export function obbOverlap(a, b) {
  return a.intersectsOBB(b);
}

// TESTED. Octree picker over a group. Rebuild after parts move.
// Returns { pick(origin: Vector3, direction: Vector3) -> { distance, point } | null }.
export function createPicker(group) {
  group.updateMatrixWorld(true);
  const octree = new Octree().fromGraphNode(group);
  const raycaster = new THREE.Raycaster();
  return {
    pick(origin, direction) {
      raycaster.set(origin, direction.clone().normalize());
      const hit = octree.rayIntersect(raycaster.ray);
      return hit === false ? null : { distance: hit.distance, point: hit.position };
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Skeletal animation & IK (three r186: CCDIKSolver takes a SkinnedMesh and
//    bone INDICES — target is a bone in the skeleton, not an Object3D)
// ---------------------------------------------------------------------------

// TESTED. bones: [{ name, position: [x,y,z], parent: index | null }].
// Returns { mesh, bones, skeleton }.
export function createSkinnedPart(geometry, boneDefs, material) {
  const bones = boneDefs.map((def) => {
    const b = new THREE.Bone();
    b.name = def.name;
    b.position.set(...def.position);
    return b;
  });
  boneDefs.forEach((def, i) => {
    if (def.parent !== null && def.parent !== undefined) bones[def.parent].add(bones[i]);
  });
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geometry, material || new THREE.MeshStandardMaterial());
  const roots = bones.filter((_, i) => boneDefs[i].parent === null || boneDefs[i].parent === undefined);
  roots.forEach((r) => mesh.add(r));
  mesh.bind(skeleton);
  return { mesh, bones, skeleton };
}

// TESTED. CCD IK over a skinned mesh. target/effector/links are bone indices.
// Add a dedicated target bone to the skeleton and move IT to pose the chain.
export function createIKChain(skinnedMesh, { target, effector, links, iterations = 10 } = {}) {
  const solver = new CCDIKSolver(skinnedMesh, [{
    target,
    effector,
    links: links.map((index) => ({ index })),
    iteration: iterations,
  }]);
  return {
    solver,
    update: () => solver.update(),
  };
}

// ---------------------------------------------------------------------------
// 7. Compression loaders (TESTED: construction; actual decode needs files+GPU)
// ---------------------------------------------------------------------------

// TESTED. Returns configured loaders; call setTranscoderPath/setDecoderPath
// with your CDN or local paths before use. Offload decode with WorkerPool.
export function createCompressedLoaders({ ktx2Path = null, dracoPath = null } = {}) {
  const ktx2 = new KTX2Loader();
  if (ktx2Path) ktx2.setTranscoderPath(ktx2Path);
  const draco = new DRACOLoader();
  if (dracoPath) draco.setDecoderPath(dracoPath);
  return { ktx2, draco };
}

// ---------------------------------------------------------------------------
// 8. WebGPU compute particles (BROWSER-ONLY: needs navigator.gpu)
// ---------------------------------------------------------------------------

// BROWSER-ONLY. GPU drift field over `count` particles via a ComputeNode.
// Returns { positionAttr, computeNode, setDelta }. Dispatch each frame with
// renderer.computeAsync(computeNode), then render points from positionAttr.
export async function createComputeDrift({ count = 4096 } = {}) {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    throw new Error('createComputeDrift needs WebGPU (navigator.gpu)');
  }
  const { uniform, Fn, instanceIndex, storage, vec3 } = await import('three/tsl');
  const { ComputeNode, StorageBufferAttribute } = await import('three/webgpu');

  const positionAttr = new StorageBufferAttribute(count * 3, 3);
  const velocityAttr = new StorageBufferAttribute(count * 3, 3);
  const pos = new Float32Array(positionAttr.array);
  const vel = new Float32Array(velocityAttr.array);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8], i * 3);
    vel.set([(Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)], i * 3);
  }
  const posNode = storage(positionAttr, 'vec3', count);
  const velNode = storage(velocityAttr, 'vec3', count);
  const dt = uniform(0);

  const drift = Fn(() => {
    const p = posNode.element(instanceIndex).toVar();
    p.assign(p.add(velNode.element(instanceIndex).mul(dt)));
  })();
  const computeNode = new ComputeNode(drift, [Math.min(64, count)]);
  return {
    positionAttr,
    computeNode,
    setDelta: (v) => { dt.value = v; },
  };
}

// ---------------------------------------------------------------------------
// 9. Post-processing chain (BROWSER-ONLY: needs a live WebGLRenderer)
// ---------------------------------------------------------------------------

// BROWSER-ONLY. EffectComposer with render + bloom + output passes.
// Pass { bloom: false } to skip UnrealBloomPass.
export async function createEffectChain(renderer, { bloom = true, bloomStrength = 0.35 } = {}) {
  const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
  const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
  const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
  const composer = new EffectComposer(renderer);
  if (bloom) {
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
      bloomStrength, 0.6, 0.85
    ));
  }
  composer.addPass(new OutputPass());
  return {
    composer,
    // Call once with your scene/camera, before composer.render() in the loop.
    addRenderPass: (scene, camera) => composer.addPass(new RenderPass(scene, camera)),
  };
}
