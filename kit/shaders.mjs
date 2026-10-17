import * as THREE from 'three';

/**
 * Custom GLSL shader for energy / fluid flow inside manifolds and pipes.
 * Drive uTime from model.js every frame. Returns the material with .userData.uniforms.
 */
export function createFluidFlowMaterial({ baseColor = 0x0ea5e9, pulseColor = 0x38bdf8 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 2.0 },
    uIntensity: { value: 1.0 },
    uBaseColor: { value: new THREE.Color(baseColor) },
    uPulseColor: { value: new THREE.Color(pulseColor) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uIntensity;
      uniform vec3 uBaseColor;
      uniform vec3 uPulseColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.2);

        // Traveling wave packet along tube UV.x
        float wave = sin(vUv.x * 24.0 - uTime * uSpeed * 6.0) * 0.5 + 0.5;
        float sharpPulse = pow(wave, 4.0);

        vec3 color = mix(uBaseColor, uPulseColor, sharpPulse) * uIntensity;
        float alpha = (0.25 + sharpPulse * 0.65) * (0.4 + fresnel * 0.6);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  material.userData.uniforms = uniforms;
  return material;
}

/**
 * BROWSER-ONLY. TSL/NodeMaterial version of the fluid pulse for WebGPURenderer.
 * Same traveling wave packet as createFluidFlowMaterial, compiled to WGSL.
 * Drive it with renderer.setAnimationLoop; speed via out.uSpeed.value.
 */
export async function createTSLFlowMaterial({ baseColor = 0x0ea5e9, pulseColor = 0x38bdf8 } = {}) {
  const { uniform, uv, sin, pow, mix, time } = await import('three/tsl');
  const { NodeMaterial } = await import('three/webgpu');

  const uSpeed = uniform(2.0);
  const uIntensity = uniform(1.0);
  const base = uniform(new THREE.Color(baseColor));
  const pulse = uniform(new THREE.Color(pulseColor));

  // Traveling wave packet along uv.x, mirroring the GLSL version.
  const wave = sin(uv().x.mul(24).sub(time.mul(uSpeed).mul(6))).mul(0.5).add(0.5);
  const sharpPulse = pow(wave, 4.0);
  const colorNode = mix(base, pulse, sharpPulse).mul(uIntensity);

  const mat = new NodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.colorNode = colorNode;
  mat.opacityNode = sharpPulse.mul(0.65).add(0.25);
  mat.userData.uniforms = { uSpeed, uIntensity };
  return mat;
}

/**
 * GPU-driven instanced particle stream along a 3D CatmullRomCurve3.
 * Call instanced.userData.update(time, flowRate) every frame from model.js state.
 */
export function createSplineParticleSystem(curve, count = 120, color = 0x38bdf8) {
  const geo = new THREE.CapsuleGeometry(0.04, 0.12, 4, 8);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color });
  const instanced = new THREE.InstancedMesh(geo, mat, count);
  const offsets = new Float32Array(count);
  const radialJitter = [];
  for (let i = 0; i < count; i++) {
    offsets[i] = i / count;
    radialJitter.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.12));
  }
  const dummy = new THREE.Object3D();
  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  instanced.userData.update = (time, flowRate = 0.25) => {
    for (let i = 0; i < count; i++) {
      const t = (offsets[i] + time * flowRate) % 1.0;
      curve.getPointAt(t, pt);
      curve.getTangentAt(t, tangent);
      dummy.position.copy(pt).add(radialJitter[i]);
      dummy.lookAt(dummy.position.clone().add(tangent));
      dummy.scale.setScalar(Math.max(0.001, Math.sin(t * Math.PI))); // Fade in and out at the ends
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  };
  return instanced;
}
