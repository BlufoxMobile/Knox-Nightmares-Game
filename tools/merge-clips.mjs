// Merge Meshy per-clip GLBs onto the original Knox skinned mesh. Usage: node merge-clips.mjs base.glb outdir/knox.glb clipsDir/
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, quantize, dedup, prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs'; import path from 'path';

const [,, basePath, outPath, clipsDir] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const base = await io.read(basePath); const root = base.getRoot();
const nodeByName = new Map(); for (const n of root.listNodes()) nodeByName.set(n.getName(), n);
// remove any existing animations on base
for (const a of root.listAnimations()) a.dispose();

// clips that should loop / be in place
const LOOP = new Set(['idle', 'combat_idle', 'run_gun', 'run', 'walk_shoot_fwd', 'walk_shoot_back', 'swim', 'swim_idle', 'sleep', 'sleep_toss', 'dance', 'look_around']);
const files = fs.readdirSync(clipsDir).filter(f => f.endsWith('.glb') && !/orig|rig_idle/.test(f)).sort();
const idleFile = fs.existsSync(path.join(clipsDir, 'rig_idle.glb')) ? ['rig_idle.glb'] : [];
const report = [];
for (const f of [...idleFile, ...files]) {
  const name = f === 'rig_idle.glb' ? 'idle' : f.replace('.glb', '');
  const doc = await io.read(path.join(clipsDir, f)); const src = doc.getRoot().listAnimations()[0]; if (!src) { console.warn('no animation in', f); continue; }
  const anim = base.createAnimation(name);
  let hipsPos = null, times = null;
  for (const ch of src.listChannels()) {
    const tn = ch.getTargetNode(); const target = nodeByName.get(tn.getName()); if (!target) continue;
    const path_ = ch.getTargetPath(); if (path_ === 'scale') continue;
    const s = ch.getSampler(); const inp = s.getInput(), out = s.getOutput();
    const inAcc = base.createAccessor().setType('SCALAR').setArray(new Float32Array(inp.getArray()));
    let arr = new Float32Array(out.getArray());
    if (path_ === 'translation') {
      if (tn.getName() !== 'Hips') continue; // only hips translation
      // strip XZ root motion, keep Y bob; measure stride speed from XZ delta (units: cm under the 0.01 Armature scale)
      const n = inp.getCount(); const t = inp.getArray(); const x0 = arr[0], z0 = arr[2], x1 = arr[(n - 1) * 3], z1 = arr[(n - 1) * 3 + 2]; const dur = t[n - 1] - t[0];
      const dist = Math.hypot(x1 - x0, z1 - z0) * 0.01; const stride = dur > 0 ? dist / dur : 0; anim.setExtras({ strideSpeed: +stride.toFixed(3), loop: LOOP.has(name) });
      for (let i = 0; i < n; i++) { arr[i * 3] = x0; arr[i * 3 + 2] = z0; }
      hipsPos = arr; times = t;
    }
    const outAcc = base.createAccessor().setType(out.getType()).setArray(arr);
    const sampler = base.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation(s.getInterpolation());
    const channel = base.createAnimationChannel().setTargetNode(target).setTargetPath(path_).setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel);
  }
  if (!anim.getExtras().loop && LOOP.has(name)) anim.setExtras({ ...anim.getExtras(), loop: true });
  const dur = Math.max(...anim.listSamplers().map(s => s.getInput().getMax([])[0]));
  report.push({ name, duration: +dur.toFixed(2), channels: anim.listChannels().length, extras: anim.getExtras() });
}
// cut the scan's arms and hands (replaced at runtime by hero gear) : drop triangles touching arm-dominant vertices
if (process.env.CUT_ARMS) {
  const joints = root.listSkins()[0].listJoints().map(j => j.getName()); const ARM = new Set(['LeftArm','RightArm','LeftForeArm','RightForeArm','LeftHand','RightHand'].map(n => joints.indexOf(n)));
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const jo = p.getAttribute('JOINTS_0').getArray(), we = p.getAttribute('WEIGHTS_0').getArray(); const N = jo.length / 4; const armW = new Float32Array(N);
    for (let i = 0; i < N; i++) { let a = 0; for (let k = 0; k < 4; k++) if (ARM.has(jo[i*4+k])) a += we[i*4+k]; armW[i] = a; }
    const idx = p.getIndices(); const ia = idx.getArray(); const keep = []; let cut = 0;
    for (let t = 0; t < ia.length; t += 3) { const a = ia[t], b = ia[t+1], c = ia[t+2]; if (armW[a] > 0.3 || armW[b] > 0.3 || armW[c] > 0.3) { cut++; continue; } keep.push(a, b, c); }
    idx.setArray(new Uint32Array(keep)); console.error('cut arm triangles', cut, 'kept', keep.length / 3);
  }
}
// normalise skin weights
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const w = p.getAttribute('WEIGHTS_0'); if (!w) continue; const a = w.getArray(); for (let i = 0; i < a.length; i += 4) { const s = a[i] + a[i + 1] + a[i + 2] + a[i + 3]; if (s > 0) { a[i] /= s; a[i + 1] /= s; a[i + 2] /= s; a[i + 3] /= s; } } w.setArray(a); }
await base.transform(resample({ tolerance: 1e-4 }), dedup(), prune());
await base.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 88, resize: [2048, 2048] }));
await base.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
await io.write(outPath, base);
console.log(JSON.stringify(report, null, 1)); console.log('written', outPath, fs.statSync(outPath).size, 'bytes');
