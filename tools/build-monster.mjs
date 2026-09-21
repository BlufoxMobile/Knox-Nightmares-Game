// Build a game-ready monster GLB: fix materials, merge shared rig clips by bone name, strip root motion, compress.
// Usage: node build-monster.mjs in.glb out.glb [clipsDir] [texSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, quantize, dedup, prune, meshopt, textureCompress, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs'; import path from 'path';

const [,, inPath, outPath, clipsDir, texSizeArg] = process.argv; const texSize = +(texSizeArg || 1024);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const doc = await io.read(inPath); const root = doc.getRoot();
// materials: Meshy rig exports are metallic=1 with the albedo also in the emissive slot -> fix
for (const m of root.listMaterials()) {
  m.setMetallicFactor(0); if (!m.getMetallicRoughnessTexture()) m.setRoughnessFactor(0.72); m.setEmissiveFactor([0, 0, 0]); if (m.getEmissiveTexture()) m.setEmissiveTexture(null);
  for (const e of m.listExtensions()) e.dispose(); m.setDoubleSided(false);
}
// rename the built-in clip by its action name, then merge shared clips
const nodeByName = new Map(); for (const n of root.listNodes()) nodeByName.set(n.getName(), n);
const LOOP = new Set(['idle', 'walk', 'run', 'sneak', 'alert', 'swim']);
const NAME_MAP = { 'Monster_Walk': 'walk', 'Slow_Orc_Walk': 'walk', 'Unsteady_Walk': 'walk', 'Injured_Walk': 'walk', 'Idle': 'idle', 'Punch_Forward_with_Both_Fists': 'attack', 'Zombie_Scream': 'scream', 'Hit_Reaction': 'hit', 'Shot_and_Fall_Backward': 'death', 'Dead': 'death2', 'Lean_Forward_Sprint_inplace': 'run', 'Heavy_Hammer_Swing': 'slam', 'Angry_Ground_Stomp': 'stomp', 'Leap_and_Punch': 'leap', 'Alert': 'alert', 'Attack': 'attack2', 'Sneaky_Walk_inplace': 'sneak' };
const report = [];
function fixAnim(anim, name) {
  anim.setName(name);
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() === 'scale') { ch.dispose(); continue; }
    if (ch.getTargetPath() === 'translation') {
      if (ch.getTargetNode().getName() !== 'Hips') { ch.dispose(); continue; }
      const s = ch.getSampler(); const out = s.getOutput(); const arr = new Float32Array(out.getArray()); const n = out.getCount(); const t = s.getInput().getArray();
      const x0 = arr[0], z0 = arr[2], x1 = arr[(n - 1) * 3], z1 = arr[(n - 1) * 3 + 2]; const dur = t[n - 1] - t[0]; const stride = dur > 0 ? Math.hypot(x1 - x0, z1 - z0) * 0.01 / dur : 0;
      for (let i = 0; i < n; i++) { arr[i * 3] = x0; arr[i * 3 + 2] = z0; } out.setArray(arr);
      anim.setExtras({ ...anim.getExtras(), strideSpeed: +stride.toFixed(3) });
    }
  }
  anim.setExtras({ ...anim.getExtras(), loop: LOOP.has(name) });
  const dur = Math.max(...anim.listSamplers().map(s => s.getInput().getMax([])[0])); report.push({ name, dur: +dur.toFixed(2) });
}
for (const a of root.listAnimations()) { const m = a.getName().match(/\|([^|]+)\|/); const raw = m ? m[1] : a.getName(); fixAnim(a, NAME_MAP[raw] || raw.toLowerCase()); }
if (clipsDir && fs.existsSync(clipsDir) && root.listSkins().length) {
  const have = new Set(root.listAnimations().map(a => a.getName()));
  for (const f of fs.readdirSync(clipsDir).filter(f => f.endsWith('.glb')).sort()) {
    const name = f.replace('.glb', ''); if (have.has(name)) continue;
    const d = await io.read(path.join(clipsDir, f)); const src = d.getRoot().listAnimations()[0]; if (!src) continue;
    const anim = doc.createAnimation(name); let ok = 0;
    for (const ch of src.listChannels()) {
      const target = nodeByName.get(ch.getTargetNode().getName()); if (!target) continue; const pth = ch.getTargetPath(); if (pth === 'scale') continue; if (pth === 'translation' && target.getName() !== 'Hips') continue;
      const s = ch.getSampler(); const inAcc = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(s.getInput().getArray())); const outAcc = doc.createAccessor().setType(s.getOutput().getType()).setArray(new Float32Array(s.getOutput().getArray()));
      const sampler = doc.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation(s.getInterpolation()); anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(pth).setSampler(sampler)); ok++;
    }
    if (ok) fixAnim(anim, name); else anim.dispose();
  }
}
// normalise weights
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const w = p.getAttribute('WEIGHTS_0'); if (!w) continue; const a = new Float32Array(w.getArray()); for (let i = 0; i < a.length; i += 4) { const s = a[i] + a[i + 1] + a[i + 2] + a[i + 3]; if (s > 0) { a[i] /= s; a[i + 1] /= s; a[i + 2] /= s; a[i + 3] /= s; } } w.setArray(a); }
await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune());
if (process.env.SIMPLIFY) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +process.env.SIMPLIFY, error: 0.001 }));
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 86, resize: [texSize, texSize] }));
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync(path.dirname(outPath), { recursive: true }); await io.write(outPath, doc);
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() || 0) / 3;
console.log(path.basename(outPath), 'tris', tris, 'clips', report.map(r => r.name + ':' + r.dur).join(' '), 'bytes', fs.statSync(outPath).size);
