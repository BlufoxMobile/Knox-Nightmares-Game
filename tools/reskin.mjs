// Re-skin the Knox scan: relative capsule distance with anatomical rules + graph smoothing.
// Usage: node reskin.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [,, inPath, outPath] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath); const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0]; const skin = root.listSkins()[0];
const joints = skin.listJoints(); const names = joints.map(j => j.getName()); const J = names.length;
const pos = prim.getAttribute('POSITION').getArray(); const idx = prim.getIndices().getArray(); const N = pos.length / 3;
// 1) cut arms/hands GEOMETRICALLY (bind pose capsules) - replaced at runtime by hero gear
const headAll = joints.map(j => { const m = j.getWorldMatrix(); return [m[12], m[13], m[14]]; });
{
  const H = n => headAll[names.indexOf(n)];
  const segD = (p, a, b) => { const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]; const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2]; const l2 = abx * abx + aby * aby + abz * abz; let t = l2 > 0 ? (apx * abx + apy * aby + apz * abz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
  const caps = [];
  for (const side of ['Left', 'Right']) {
    const arm = H(side + 'Arm'), fore = H(side + 'ForeArm'), hand = H(side + 'Hand');
    caps.push([arm, fore, 0.075]); caps.push([fore, hand, 0.07]); caps.push([hand, [hand[0] + (side === 'Left' ? -0.03 : 0.03), hand[1] - 0.07, hand[2] + 0.13], 0.085]);
  }
  const cutV = new Uint8Array(N); const p = [0, 0, 0]; let nc = 0;
  for (let i = 0; i < N; i++) { p[0] = pos[i * 3]; p[1] = pos[i * 3 + 1]; p[2] = pos[i * 3 + 2]; for (const [a, b, r] of caps) if (segD(p, a, b) < r) { cutV[i] = 1; nc++; break; } }
  const keep = []; let cut = 0; for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (cutV[a] || cutV[b] || cutV[c]) { cut++; continue; } keep.push(a, b, c); }
  prim.getIndices().setArray(new Uint32Array(keep)); console.error('cut verts', nc, 'cut arm triangles', cut, 'kept', keep.length / 3);
}
const idx2 = prim.getIndices().getArray();
const head = joints.map(j => { const m = j.getWorldMatrix(); return [m[12], m[13], m[14]]; });
const parent = names.map((n, i) => { const p = joints[i].getParentNode(); return p ? names.indexOf(p.getName()) : -1; });
const children = names.map((n, i) => joints.map((j, k) => parent[k] === i ? k : -1).filter(k => k >= 0));
const tail = names.map((n, i) => { const ch = children[i].filter(k => !/head_end|headfront/.test(names[k])); if (ch.length) { const t = [0, 0, 0]; for (const k of ch) { t[0] += head[k][0]; t[1] += head[k][1]; t[2] += head[k][2]; } return t.map(v => v / ch.length); } const p = parent[i] >= 0 ? head[parent[i]] : [head[i][0], head[i][1] - 0.1, head[i][2]]; const d = [head[i][0] - p[0], head[i][1] - p[1], head[i][2] - p[2]]; const ext = /Hand/.test(n) ? 1.8 : /Toe/.test(n) ? 1.2 : 1.0; return [head[i][0] + d[0] * ext, head[i][1] + d[1] * ext, head[i][2] + d[2] * ext]; });
// influence radii (metres; the scan is 1.7 m tall)
const R = { Hips: 0.17, Spine: 0.17, Spine01: 0.17, Spine02: 0.16, neck: 0.075, Head: 0.15, LeftShoulder: 0.07, RightShoulder: 0.07, LeftArm: 0.065, RightArm: 0.065, LeftForeArm: 0.055, RightForeArm: 0.055, LeftHand: 0.06, RightHand: 0.06, LeftUpLeg: 0.105, RightUpLeg: 0.105, LeftLeg: 0.075, RightLeg: 0.075, LeftFoot: 0.06, RightFoot: 0.06, LeftToeBase: 0.05, RightToeBase: 0.05 };
const ARM = new Set(['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']);
const TORSO = ['Hips', 'Spine', 'Spine01', 'Spine02'].map(n => names.indexOf(n));
const skipBone = names.map(n => /head_end|headfront/.test(n));
function segDist(p, a, b) { const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]; const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2]; const l2 = abx * abx + aby * aby + abz * abz; let t = l2 > 0 ? (apx * abx + apy * aby + apz * abz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
// graph with tolerant welding
const adj = new Array(N); for (let i = 0; i < N; i++) adj[i] = new Set();
for (let t = 0; t < idx2.length; t += 3) { const a = idx2[t], b = idx2[t + 1], c = idx2[t + 2]; adj[a].add(b); adj[b].add(a); adj[b].add(c); adj[c].add(b); adj[c].add(a); adj[a].add(c); }
const cellSize = 0.002; const grid = new Map();
for (let i = 0; i < N; i++) { const k = `${Math.floor(pos[i * 3] / cellSize)},${Math.floor(pos[i * 3 + 1] / cellSize)},${Math.floor(pos[i * 3 + 2] / cellSize)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
let welds = 0; for (let i = 0; i < N; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cz = Math.floor(z / cellSize); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!cell) continue; for (const j of cell) { if (j === i) continue; const d = Math.hypot(pos[j * 3] - x, pos[j * 3 + 1] - y, pos[j * 3 + 2] - z); if (d < 0.0015) { adj[i].add(j); adj[j].add(i); welds++; } } } }
console.error('welds', welds);
// initial weights
let W = new Float32Array(N * J); const p = [0, 0, 0]; const rel = new Float32Array(J);
let ruled = 0;
for (let i = 0; i < N; i++) {
  p[0] = pos[i * 3]; p[1] = pos[i * 3 + 1]; p[2] = pos[i * 3 + 2];
  let torsoRel = 1e9; for (let b = 0; b < J; b++) { if (skipBone[b]) { rel[b] = 1e9; continue; } rel[b] = segDist(p, head[b], tail[b]) / (R[names[b]] || 0.06); }
  for (const b of TORSO) torsoRel = Math.min(torsoRel, rel[b]);
  let sum = 0;
  for (let b = 0; b < J; b++) {
    if (rel[b] >= 1) continue; let w = (1 - rel[b]); w = w * w * w;
    // rule: arm bones may only claim vertices inside the torso capsule if the vertex is clearly on the arm
    if (ARM.has(names[b])) { w = 0; ruled++; }
    W[i * J + b] = w; sum += w;
  }
  if (sum <= 0) { let best = 0, bd = 1e9; for (let b = 0; b < J; b++) if (rel[b] < bd) { bd = rel[b]; best = b; } W[i * J + best] = 1; sum = 1; }
  for (let b = 0; b < J; b++) W[i * J + b] /= sum;
}
console.error('rule applied', ruled);
// graph smoothing (weights diffuse over the surface -> soft seams, no spikes)
for (let it = 0; it < 10; it++) {
  const W2 = new Float32Array(N * J);
  for (let i = 0; i < N; i++) {
    const A = adj[i]; const cnt = A.size + 2; for (let b = 0; b < J; b++) W2[i * J + b] = W[i * J + b] * 2;
    for (const j of A) for (let b = 0; b < J; b++) W2[i * J + b] += W[j * J + b];
    let s = 0; for (let b = 0; b < J; b++) { W2[i * J + b] /= cnt; s += W2[i * J + b]; } for (let b = 0; b < J; b++) W2[i * J + b] /= s || 1;
  }
  W = W2;
}
// top-4 per vertex
const JO = new Uint16Array(N * 4), WE = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  const c = []; for (let b = 0; b < J; b++) if (W[i * J + b] > 0.01) c.push([W[i * J + b], b]); c.sort((x, y) => y[0] - x[0]); const top = c.slice(0, 4); const s = top.reduce((a, v) => a + v[0], 0) || 1;
  for (let k = 0; k < 4; k++) { JO[i * 4 + k] = k < top.length ? top[k][1] : 0; WE[i * 4 + k] = k < top.length ? top[k][0] / s : 0; }
}
prim.getAttribute('JOINTS_0').setArray(JO); prim.getAttribute('WEIGHTS_0').setArray(WE);
await io.write(outPath, doc); console.log('written', outPath);
