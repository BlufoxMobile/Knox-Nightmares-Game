import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const d = await io.read(process.argv[2]);
const skin = d.getRoot().listSkins()[0]; const J1 = skin.listJoints().map(j => j.getName());
const ja = [0, 0, 0, 0], wa = [0, 0, 0, 0], pa = [0, 0, 0]; const dom = {}; let below = 0;
for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), P = p.getAttribute('POSITION'); if (!J) continue;
  for (let i = 0; i < J.getCount(); i++) { J.getElement(i, ja); W.getElement(i, wa); P.getElement(i, pa);
    if (pa[1] >= 0) continue; below++; let bi = 0, bw = -1; for (let k = 0; k < 4; k++) if (wa[k] > bw) { bw = wa[k]; bi = ja[k]; }
    const n = J1[bi]; dom[n] = (dom[n] || 0) + 1; } }
console.log('below waist:', below);
for (const [n, c] of Object.entries(dom).sort((a, b) => b[1] - a[1])) console.log('  ' + n.padEnd(14), String(c).padStart(5), (c / below * 100).toFixed(1) + '%');
