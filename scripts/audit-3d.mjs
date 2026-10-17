#!/usr/bin/env node
// audit-3d.mjs — 3D spatial and kinematic audit for anatomy builds.
//
// Checks:
//   0. Layer order contract: disassembly is the exact reverse of assembly.
//   1. NaN / Infinity sweep over the kinematic solvers (slider-crank, four-bar).
//   2. Bounding-box collision: every dynamic part must not clip a static part.
//   3. Optional Playwright WebGL snapshots (--snapshot <url>).
//
// Usage:
//   node scripts/audit-3d.mjs [--manifest parts.json] [--snapshot http://localhost:5173]
//
// Manifest format (JSON):
//   { "parts": [ { "name": "rod-1", "group": "mechanismGroup",
//                  "dynamic": true, "min": [x,y,z], "max": [x,y,z],
//                  "explode": [x,y,z] }, ... ] }
// Groups "baseGroup" and "structureGroup" are treated as static.
// "explode" is the part's explodeVec; the audit sweeps it to catch parts
// passing through each other mid-sequence.

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL ' + msg); };
const ok = (msg) => console.log('ok   ' + msg);

// ---------------------------------------------------------------------------
// 0. Layer order contract (Lego-style staged explode / reassemble)
// ---------------------------------------------------------------------------
let rig;
try {
  rig = await import('../kit/rig.mjs');
} catch (e) {
  console.error('ERROR cannot load kit/rig.mjs. Run `npm install three` from the repo root first.');
  process.exit(2);
}

const expectedDisassembly = [...rig.ASSEMBLY_ORDER].reverse();
if (JSON.stringify(rig.disassemblyOrder()) !== JSON.stringify(expectedDisassembly)) {
  fail('disassembly order is not the exact reverse of assembly order');
} else {
  ok('layer order: disassembly is the exact reverse of assembly (' + expectedDisassembly.join(' -> ') + ')');
}

// Pro kit API surface: every documented helper must exist and be callable.
let pro;
try {
  pro = await import('../kit/pro.mjs');
} catch (e) {
  fail('cannot load kit/pro.mjs: ' + e.message);
}
if (pro) {
  const EXPECTED = ['createSharedUniforms', 'batchFasteners', 'createLODPart',
    'createInterleavedGeometry', 'matrixFromPose', 'inFrustum', 'createOBB',
    'obbOverlap', 'createPicker', 'createSkinnedPart', 'createIKChain',
    'createCompressedLoaders', 'createComputeDrift', 'createEffectChain'];
  const missing = EXPECTED.filter((name) => typeof pro[name] !== 'function');
  if (missing.length) fail('kit/pro.mjs missing exports: ' + missing.join(', '));
  else ok(`pro kit API complete (${EXPECTED.length} helpers)`);
}

// ---------------------------------------------------------------------------
// 1. NaN / Infinity sweep over kinematic solvers
// ---------------------------------------------------------------------------
let kin;
try {
  kin = await import('../kit/kinematics.mjs');
} catch (e) {
  console.error('ERROR cannot load kit/kinematics.mjs. Run `npm install three` from the repo root first.');
  process.exit(2);
}

const allFinite = (obj) =>
  Object.values(obj).every((v) => {
    if (typeof v === 'number') return Number.isFinite(v);
    if (v && typeof v === 'object') return allFinite(v);
    return true;
  });

let crankChecks = 0;
for (const crankRadius of [0.3, 0.5, 1.0]) {
  for (const rodLength of [1.2, 2.0, 3.5]) {
    for (let s = 0; s <= 720; s++) {
      const a = (s / 720) * Math.PI * 2;
      const r = kin.solveSliderCrank(a, crankRadius, rodLength);
      crankChecks++;
      if (!allFinite(r)) fail(`solveSliderCrank NaN at angle=${a} crankRadius=${crankRadius} rodLength=${rodLength}`);
    }
  }
}
ok(`slider-crank finite over ${crankChecks} samples`);

let fourBarChecks = 0;
for (const [L1, L2, L3, L4] of [[4, 1, 3.5, 3], [5, 1.5, 4, 3.5], [3, 0.8, 2.5, 2.2]]) {
  for (let s = 0; s <= 720; s++) {
    const t = (s / 720) * Math.PI * 2;
    const r = kin.solveFourBar(t, L1, L2, L3, L4);
    fourBarChecks++;
    if (!allFinite(r)) fail(`solveFourBar NaN at theta2=${t} links=[${L1},${L2},${L3},${L4}]`);
  }
}
ok(`four-bar finite over ${fourBarChecks} samples`);

// ---------------------------------------------------------------------------
// 2. Bounding-box collision: dynamic parts vs static parts
// ---------------------------------------------------------------------------
const manifestPath = flag('--manifest');
if (manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const parts = manifest.parts || [];
  const overlaps = (a, b) =>
    a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2];

  for (const p of parts) {
    if (!rig.ASSEMBLY_ORDER.includes(p.group)) fail(`unknown group "${p.group}" on part "${p.name}" (want one of ${rig.ASSEMBLY_ORDER.join(', ')})`);
  }
  const staticParts = parts.filter((p) => !p.dynamic);
  const dynamicParts = parts.filter((p) => p.dynamic);
  // Swept check: sample the staged explode at several t values, offsetting each
  // part's box by its own explode vector * t (parts may declare "explode": [x,y,z]).
  const boxAt = (p, t) => {
    const e = p.explode || [0, 0, 0];
    return {
      min: [p.min[0] + e[0] * t, p.min[1] + e[1] * t, p.min[2] + e[2] * t],
      max: [p.max[0] + e[0] * t, p.max[1] + e[1] * t, p.max[2] + e[2] * t],
    };
  };
  const SAMPLES = [0, 0.25, 0.5, 0.75, 1];
  let pairs = 0;
  const failuresBefore = failures;
  for (const d of dynamicParts) {
    for (const s of staticParts) {
      for (const t of SAMPLES) {
        pairs++;
        if (overlaps(boxAt(d, t), boxAt(s, t))) {
          fail(`collision: dynamic "${d.name}" clips static "${s.name}" at explode t=${t}`);
          break;
        }
      }
    }
  }
  if (failures === failuresBefore) {
    ok(`swept collision clean over ${pairs} pair-samples (${dynamicParts.length} dynamic, ${staticParts.length} static, ${SAMPLES.length} explode steps)`);
  }
} else {
  console.log('skip collision check (no --manifest given)');
}

// ---------------------------------------------------------------------------
// 3. Optional Playwright WebGL snapshots
// ---------------------------------------------------------------------------
const snapshotUrl = flag('--snapshot');
if (snapshotUrl) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.log('skip snapshots (playwright not installed; `npm i playwright` to enable)');
  }
  if (playwright) {
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const states = [
      ['default', ''],
      ['exploded', '?explode=1'],
      ['thermal-peak', '?thermal=peak'],
    ];
    for (const [name, qs] of states) {
      await page.goto(snapshotUrl + qs, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `audit-${name}.png` });
      ok(`snapshot saved audit-${name}.png — eyeball it before shipping`);
    }
    await browser.close();
  }
} else {
  console.log('skip snapshots (no --snapshot given)');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll audit checks passed.');
