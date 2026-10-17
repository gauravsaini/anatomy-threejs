import * as THREE from 'three';

/**
 * Procedural spur gear with central bore.
 * Builds the outline with an explicit moveTo so no stray edge runs from the origin.
 */
export function createGearGeometry({ teeth = 16, module = 0.2, thickness = 0.4, boreRadius = 0.3 }) {
  const pitchRadius = (teeth * module) / 2;
  const outerRadius = pitchRadius + module;
  const rootRadius = pitchRadius - 1.25 * module;
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;

  shape.moveTo(Math.cos(0) * rootRadius, Math.sin(0) * rootRadius);
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    shape.lineTo(Math.cos(a + step * 0.18) * rootRadius, Math.sin(a + step * 0.18) * rootRadius);
    shape.lineTo(Math.cos(a + step * 0.32) * outerRadius, Math.sin(a + step * 0.32) * outerRadius);
    shape.lineTo(Math.cos(a + step * 0.62) * outerRadius, Math.sin(a + step * 0.62) * outerRadius);
    shape.lineTo(Math.cos(a + step * 0.76) * rootRadius, Math.sin(a + step * 0.76) * rootRadius);
    shape.lineTo(Math.cos(a + step) * rootRadius, Math.sin(a + step) * rootRadius);
  }
  shape.closePath();

  const bore = new THREE.Path();
  bore.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: 0.03,
    bevelSize: 0.03, bevelSegments: 2
  });
  geo.center();
  return geo;
}

/**
 * GPU vertex-deformed helical spring. Compress it smoothly via setCompression(length).
 */
export function createDynamicSpring({ radius = 0.5, wireRadius = 0.07, turns = 8, restLength = 3.0 }) {
  const points = [];
  const samples = turns * 24;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const angle = t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, t * restLength, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, samples * 2, wireRadius, 12, false);
  const uniforms = { uScaleY: { value: 1.0 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.85, roughness: 0.25 });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uScaleY = uniforms.uScaleY;
    shader.vertexShader = 'uniform float uScaleY;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3(position.x, position.y * uScaleY, position.z);'
    );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.setCompression = (currentLength) => {
    uniforms.uScaleY.value = currentLength / restLength;
  };
  return mesh;
}

/**
 * Routed tube along control points. Route around pillars, never through solid geometry.
 */
export function createRoutedTube(points, { radius = 0.09, tubularSegments = 64, radialSegments = 12, material } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const mat = material || new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.6, roughness: 0.4 });
  return new THREE.Mesh(geo, mat);
}
