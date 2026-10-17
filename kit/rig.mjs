import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Build order, base first. Disassembly runs in exact reverse, like Lego:
// subject comes off first, base comes off last; reassembly is base-first.
export const ASSEMBLY_ORDER = ['baseGroup', 'structureGroup', 'mechanismGroup', 'fluidAndParticlesGroup', 'subjectGroup'];
export const disassemblyOrder = () => [...ASSEMBLY_ORDER].reverse();

// Resolve a part's layer by walking up to the nearest named assembly group.
export function layerOf(part) {
  let o = part;
  while (o) {
    if (ASSEMBLY_ORDER.includes(o.name)) return o.name;
    o = o.parent;
  }
  return null;
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const vecLen = (v) => (v && typeof v.length === 'function' ? v.length() : 0);

// DOM-free staged sequencer. Parts are objects with userData { restPos, explodeVec, explodeT }
// and a Vector3-like position supporting copy() and addScaledVector().
// One layer animates at a time; the next starts only when the current finishes.
// Within a layer, outer parts (longer explodeVec) lead with a slight stagger.
export function createLayerSequencer(parts) {
  const seq = {
    running: false,
    direction: 'out',
    layers: [],
    index: 0,
    onProgress: null,
    onComplete: null,
  };

  function applyLayer(layer) {
    const n = layer.order.length;
    for (let i = 0; i < n; i++) {
      const p = layer.order[i];
      const local = n > 1 && layer.stagger > 0
        ? Math.min(1, Math.max(0, (layer.t - i * layer.stagger) / (1 - layer.stagger * (n - 1))))
        : Math.min(1, layer.t);
      const e = easeInOutCubic(local);
      const v = layer.from + (layer.to - layer.from) * e;
      p.userData.explodeT = v;
      p.position.copy(p.userData.restPos).addScaledVector(p.userData.explodeVec, v);
    }
  }

  function reportProgress() {
    if (seq.onProgress && seq.layers.length) {
      const layer = seq.layers[seq.index];
      seq.onProgress({
        direction: seq.direction,
        layerIndex: seq.index,
        layerName: layer.name,
        layersTotal: seq.layers.length,
      });
    }
  }

  seq.start = (direction, { layerDuration = 0.9, stagger = 0.12, onProgress = null, onComplete = null } = {}) => {
    const order = direction === 'out' ? disassemblyOrder() : [...ASSEMBLY_ORDER];
    seq.layers = [];
    for (const name of order) {
      const layerParts = parts.filter((p) => layerOf(p) === name);
      if (layerParts.length) {
        // Outer parts lead: sort by explodeVec length, longest first.
        const sorted = [...layerParts].sort((a, b) => vecLen(b.userData.explodeVec) - vecLen(a.userData.explodeVec));
        seq.layers.push({
          name,
          parts: layerParts,
          order: sorted,
          t: 0,
          dur: layerDuration,
          stagger,
          from: direction === 'out' ? 0 : 1,
          to: direction === 'out' ? 1 : 0,
        });
      }
    }
    seq.direction = direction;
    seq.index = 0;
    seq.running = seq.layers.length > 0;
    seq.onProgress = onProgress;
    seq.onComplete = onComplete;
    if (seq.running) reportProgress();
  };

  seq.stop = () => { seq.running = false; };

  seq.update = (dt) => {
    if (!seq.running) return;
    const layer = seq.layers[seq.index];
    layer.t += dt / layer.dur;
    applyLayer(layer);
    if (layer.t >= 1) {
      seq.index++;
      if (seq.index >= seq.layers.length) {
        seq.running = false;
        if (seq.onComplete) seq.onComplete({ direction: seq.direction });
      } else {
        reportProgress();
      }
    }
  };

  return seq;
}

// Named focus points for reveal choreography (macro dives, feature close-ups).
// getCamera() returns the active camera; controls carries a Vector3 target.
// DOM-free: works with fake { position } / { target } objects in tests.
export function createCameraRig(getCamera, controls) {
  const anchors = new Map();
  const tweens = [];

  const rig = {
    addAnchor(name, pos) {
      anchors.set(name, pos.clone());
      return rig;
    },
    hasAnchor: (name) => anchors.has(name),
    anchorNames: () => [...anchors.keys()],
    focusOn(name, { duration = 1.2, distance = null, onComplete = null } = {}) {
      const target = anchors.get(name);
      if (!target) throw new Error('unknown anchor: ' + name);
      const cam = getCamera();
      const dir = cam.position.clone().sub(controls.target).normalize();
      const dist = distance === null ? cam.position.distanceTo(controls.target) : distance;
      tweens.push({
        t: 0,
        duration,
        fromTarget: controls.target.clone(),
        fromPos: cam.position.clone(),
        toTarget: target.clone(),
        toPos: target.clone().addScaledVector(dir, dist),
        onComplete,
      });
      return rig;
    },
    update(dt) {
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt / tw.duration;
        const e = easeInOutCubic(Math.min(1, tw.t));
        const cam = getCamera();
        controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
        cam.position.lerpVectors(tw.fromPos, tw.toPos, e);
        if (tw.t >= 1) {
          tweens.splice(i, 1);
          if (tw.onComplete) tw.onComplete();
        }
      }
    },
  };
  return rig;
}

export function createAnatomyRig(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f12); // Deep technical slate

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

  const aspect = container.clientWidth / container.clientHeight;
  const frustumSize = 14;
  const orthoCam = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2, (frustumSize * aspect) / 2,
    frustumSize / 2, -frustumSize / 2, 0.1, 1000
  );
  const perspCam = new THREE.PerspectiveCamera(35, aspect, 0.1, 1000);

  // Classic technical azimuth 45 deg, elevation 30 deg
  const defaultPos = new THREE.Vector3(16, 13, 16);
  orthoCam.position.copy(defaultPos);
  perspCam.position.copy(defaultPos);

  let activeCam = perspCam;
  const controls = new OrbitControls(activeCam, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Studio 3-point technical lighting
  const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.5);
  keyLight.position.set(12, 24, 14);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.4);
  rimLight.position.set(-15, 10, -12);
  scene.add(rimLight);

  // Exploded view registry. Each part carries its own explodeT (0 = assembled, 1 = flown out).
  const explodableParts = [];
  const sequencer = createLayerSequencer(explodableParts);
  const cameraRig = createCameraRig(() => activeCam, controls);

  function registerPart(mesh, explodeVec = new THREE.Vector3(0, 0, 0), addCreaseLines = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.restPos = mesh.position.clone();
    mesh.userData.explodeVec = explodeVec;
    mesh.userData.explodeT = 0;
    explodableParts.push(mesh);

    if (addCreaseLines && mesh.geometry) {
      const edges = new THREE.EdgesGeometry(mesh.geometry, 28);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
      );
      mesh.add(line);
    }
    return mesh;
  }

  function applyExplode() {
    for (const part of explodableParts) {
      part.position.copy(part.userData.restPos).addScaledVector(part.userData.explodeVec, part.userData.explodeT);
    }
  }

  function toggleCamera() {
    const prevCam = activeCam;
    activeCam = activeCam === perspCam ? orthoCam : perspCam;
    activeCam.position.copy(prevCam.position);
    activeCam.quaternion.copy(prevCam.quaternion);
    controls.object = activeCam;
    controls.update();
  }

  return {
    scene, renderer, controls,
    registerPart,
    // Instant explode (0..1) for scrubbing and snapshot states. Stops any staged run.
    setExplode: (val) => {
      sequencer.stop();
      for (const p of explodableParts) p.userData.explodeT = val;
      applyExplode();
    },
    // Staged Lego-style sequences. opts: { layerDuration, onProgress, onComplete }.
    explodeStaged: (opts) => sequencer.start('out', opts),
    reassembleStaged: (opts) => sequencer.start('in', opts),
    stopStaged: () => sequencer.stop(),
    stagedRunning: () => sequencer.running,
    toggleCamera,
    // Named focus points for the reveal: rig.addAnchor('gauge', new THREE.Vector3(...))
    // then rig.focusOn('gauge') to dive the camera there.
    addAnchor: (name, pos) => cameraRig.addAnchor(name, pos),
    focusOn: (name, opts) => cameraRig.focusOn(name, opts),
    anchorNames: () => cameraRig.anchorNames(),
    render: (dt) => {
      sequencer.update(dt);
      cameraRig.update(dt);
      applyExplode();
      controls.update();
      renderer.render(scene, activeCam);
    }
  };
}
