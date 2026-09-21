// Cap monster/hero texture resolution: 2048² albedo on a shark 20 m away costs 22 MB of VRAM each.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs'; import path from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const DIR = path.resolve('../assets');
const CAP = { 'monsters/megalodon.glb': 1024, 'monsters/hollowstag.glb': 1024, 'monsters/rotking.glb': 1024,
  'monsters/reaper.glb': 1024, 'monsters/lantern.glb': 1024, 'monsters/rotter.glb': 1024, 'monsters/bloater.glb': 1024,
  'monsters/stalker.glb': 1024, 'characters/knox.glb': 2048 };
for (const [rel, cap] of Object.entries(CAP)) {
  const f = path.join(DIR, rel); if (!fs.existsSync(f)) { console.log('skip', rel); continue; }
  const before = fs.statSync(f).size;
  const doc = await io.read(f);
  const sizes = doc.getRoot().listTextures().map(t => (t.getSize() || [0, 0]).join('x'));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 88, resize: [cap, cap] }));
  await io.write(f, doc);
  const after = fs.statSync(f).size;
  console.log(rel, sizes.join(','), '->', doc.getRoot().listTextures().map(t => (t.getSize() || [0, 0]).join('x')).join(','), (before / 1e6).toFixed(2) + 'MB ->', (after / 1e6).toFixed(2) + 'MB');
}
