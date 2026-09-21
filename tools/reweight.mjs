// Re-weight the Knox scan's skin. The old pass normalised distance by per-bone radius, which let the
// fat capsules (Hips 0.17, thigh 0.105) out-bid the shin (0.075) and steal its vertices — so the knees
// rotated but the mesh barely followed. This does nearest-bone-segment with anatomical gates instead.
// Usage: node reweight.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';

const [, , inPath, outPath] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inPath); const root = doc.getRoot();
const skin = root.listSkins()[0]; const joints = skin.listJoints();
const names = joints.map(j => j.getName()); const J = names.length;

// bone rest positions, from the inverse bind matrices (authoritative for the bind pose)
const ibm = skin.getInverseBindMatrices().getArray();
const m4 = new Matrix4(), v3 = new Vector3();
const head = names.map((_, i) => { m4.fromArray(Array.from(ibm.slice(i * 16, i * 16 + 16))).invert(); v3.setFromMatrixPosition(m4); return [v3.x, v3.y, v3.z]; });
const parent = names.map((n, i) => { const p = joints[i].getParentNode(); return p ? names.indexOf(p.getName()) : -1; });
const kids = names.map((_, i) => names.map((_, k) => parent[k] === i ? k : -1).filter(k => k >= 0));
// tail: toward the child that continues the limb. headfront is a face helper, not a continuation.
const tail = names.map((n, i) => {
  const ch = kids[i].filter(k => !/headfront/.test(names[k]));
  if (ch.length) { const t = [0, 0, 0]; for (const k of ch) for (let a = 0; a < 3; a++) t[a] += head[k][a]; return t.map(v => v / ch.length); }
  const p = parent[i] >= 0 ? head[parent[i]] : [head[i][0], head[i][1] - 0.1, head[i][2]];
  const d = [0, 1, 2].map(a => head[i][a] - p[a]); const ext = /Toe/.test(n) ? 1.3 : 1.0;
  return [0, 1, 2].map(a => head[i][a] + d[a] * ext);
});

const idxOf = n => names.indexOf(n);
const kneeY = Math.min(head[idxOf('LeftLeg')][1], head[idxOf('RightLeg')][1]);
const ankleY = Math.min(head[idxOf('LeftFoot')][1], head[idxOf('RightFoot')][1]);
const hipY = head[idxOf('Hips')][1];
const toeZ = Math.max(head[idxOf('LeftToeBase')][2], head[idxOf('RightToeBase')][2]);
const SKIP = new Set(['head_end', 'headfront']);
const ARM = new Set(['LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']);
// mild per-bone bias: >1 makes a bone slightly greedier. Kept close to 1 so geometry, not tuning, decides.
const BIAS = { Hips: 1.12, Spine: 1.05, Spine01: 1.05, Spine02: 1.05, neck: 0.95, Head: 1.15, LeftUpLeg: 1.0, RightUpLeg: 1.0, LeftLeg: 0.95, RightLeg: 0.95, LeftFoot: 0.95, RightFoot: 0.95, LeftToeBase: 0.9, RightToeBase: 0.9 };

function segDist(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? (apx * abx + apy * aby + apz * abz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const POS = prim.getAttribute('POSITION'), JA = prim.getAttribute('JOINTS_0'), WA = prim.getAttribute('WEIGHTS_0');
  if (!POS || !JA || !WA) continue;
  const N = POS.getCount(); const p = [0, 0, 0];
  const outJ = new Uint16Array(N * 4), outW = new Float32Array(N * 4);
  const rel = new Float64Array(J);
  for (let i = 0; i < N; i++) {
    POS.getElement(i, p);
    const side = p[0];
    for (let b = 0; b < J; b++) {
      const n = names[b];
      if (SKIP.has(n) || ARM.has(n)) { rel[b] = 1e9; continue; }   // arms are cut geometry; HeroGear covers them
      // anatomical gates: a bone may not reach past the joint below it
      if (n === 'Hips' && p[1] < kneeY) { rel[b] = 1e9; continue; }
      if (/UpLeg/.test(n) && p[1] < kneeY - 0.05) { rel[b] = 1e9; continue; }   // thigh stops at the knee (0.05 blend band)
      if (/^(Left|Right)Leg$/.test(n) && p[1] < ankleY - 0.04) { rel[b] = 1e9; continue; }
      if (/Foot/.test(n) && p[1] > kneeY) { rel[b] = 1e9; continue; }
      if (/Toe/.test(n) && (p[1] > ankleY + 0.02 || p[2] < toeZ - 0.10)) { rel[b] = 1e9; continue; }  // toes are the front of the shoe only
      if (/(Spine|neck|Head)/.test(n) && p[1] < hipY - 0.06) { rel[b] = 1e9; continue; }
      // left/right gate below the hips, so the two legs never weld together
      if (p[1] < hipY) { if (/^Left/.test(n) && side < -0.015) { rel[b] = 1e9; continue; } if (/^Right/.test(n) && side > 0.015) { rel[b] = 1e9; continue; } }
      rel[b] = segDist(p, head[b], tail[b]) / (BIAS[n] || 1);
    }
    let r0 = 1e9; for (let b = 0; b < J; b++) if (rel[b] < r0) r0 = rel[b];
    if (r0 >= 1e8) { outJ[i * 4] = idxOf('Hips'); outW[i * 4] = 1; continue; }
    // blend every bone within 1.7x of the nearest; sharp falloff keeps limbs crisp, soft enough at joints
    const cand = [];
    for (let b = 0; b < J; b++) if (rel[b] < r0 * 1.7) cand.push([b, Math.pow(r0 / Math.max(rel[b], 1e-6), 4)]);
    cand.sort((a, c) => c[1] - a[1]);
    const top = cand.slice(0, 4); let s = 0; for (const c of top) s += c[1];
    for (let k = 0; k < top.length; k++) { outJ[i * 4 + k] = top[k][0]; outW[i * 4 + k] = top[k][1] / s; }
  }
  // smooth across the mesh graph so joints crease instead of facet
  const ind = prim.getIndices().getArray();
  const adj = Array.from({ length: N }, () => new Set());
  for (let t = 0; t < ind.length; t += 3) { const a = ind[t], b = ind[t + 1], c = ind[t + 2]; adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); acc(adj[c], a, b); }
  function acc(s, x, y) { s.add(x); s.add(y); }
  for (let pass = 0; pass < 3; pass++) {
    const acc2 = new Map();
    for (let i = 0; i < N; i++) {
      const w = new Map();
      const add = (j, x) => w.set(j, (w.get(j) || 0) + x);
      for (let k = 0; k < 4; k++) if (outW[i * 4 + k] > 0) add(outJ[i * 4 + k], outW[i * 4 + k] * 2);
      for (const nb of adj[i]) for (let k = 0; k < 4; k++) if (outW[nb * 4 + k] > 0) add(outJ[nb * 4 + k], outW[nb * 4 + k] / adj[i].size);
      acc2.set(i, [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4));
    }
    for (let i = 0; i < N; i++) { const e = acc2.get(i); let s = 0; for (const [, x] of e) s += x;
      for (let k = 0; k < 4; k++) { outJ[i * 4 + k] = k < e.length ? e[k][0] : 0; outW[i * 4 + k] = k < e.length ? e[k][1] / s : 0; } }
  }
  JA.setArray(outJ); WA.setArray(outW);
}
await io.write(outPath, doc);
console.log('wrote', outPath);
