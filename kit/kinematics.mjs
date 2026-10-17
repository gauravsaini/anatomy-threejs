import * as THREE from 'three';

/**
 * Slider-crank solver (piston + connecting rod + crankshaft).
 * Returns exact piston displacement and connecting rod angle for a crank angle.
 */
export function solveSliderCrank(crankAngle, crankRadius, rodLength) {
  const sinA = Math.sin(crankAngle);
  const cosA = Math.cos(crankAngle);

  // Connecting rod angle phi
  const sinPhi = (crankRadius / rodLength) * sinA;
  const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi));
  const rodAngle = Math.asin(THREE.MathUtils.clamp(sinPhi, -1, 1));

  // Exact piston displacement along axis
  const displacement = crankRadius * cosA + rodLength * cosPhi;
  const crankPin = { x: crankRadius * sinA, y: crankRadius * cosA };

  return { displacement, rodAngle, crankPin };
}

/**
 * Planar four-bar linkage solver (geometric circle intersection).
 * L1 = ground link, L2 = crank, L3 = coupler, L4 = rocker.
 */
export function solveFourBar(theta2, L1, L2, L3, L4) {
  const Ax = L2 * Math.cos(theta2);
  const Ay = L2 * Math.sin(theta2);
  const dx = L1 - Ax;
  const dy = -Ay;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  const cosAlpha = (L3 * L3 + d2 - L4 * L4) / (2 * L3 * d);
  const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));
  const baseAngle = Math.atan2(dy, dx);
  const theta3 = baseAngle + alpha; // Coupler angle
  const Bx = Ax + L3 * Math.cos(theta3);
  const By = Ay + L3 * Math.sin(theta3);
  const theta4 = Math.atan2(By, Bx - L1); // Rocker angle
  return { A: { x: Ax, y: Ay }, B: { x: Bx, y: By }, theta3, theta4 };
}
