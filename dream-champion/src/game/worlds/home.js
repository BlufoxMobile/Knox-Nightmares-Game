// HOME — Knox's bedroom at night: the wake-up screen and the finale. Bed (Knox lies at bedPos), window with blue moonlight,
// a cracked door with a warm hallway sliver, posters (boss skull trophies appear via trophies(n)), a nightlight, star stickers.
import * as THREE from 'three';
import { FOG } from '../../render/fx.js';
import { dir3, seeded, Disposer, shadowMats, caster, stdMat, xform, merge, withColor, noiseTexture, normalFromNoise, radialAlphaTexture, Glows, TAU } from './common.js';

export const THEME = {
  key: 'home', name: "KNOX'S ROOM", sub: '', tagline: 'His room. His rules.', boss: null, bossName: '', bossTitle: '', bossQuote: '', ammo: 'starfire', accent: 0xffb060, radius: 2, underwater: false,
  sky: { zenith: 0x05070f, horizon: 0x101628, ground: 0x030304, moonColor: 0xbfd0ff, moonDir: dir3(0.2, 0.5, -0.8), moonSize: 0.012, moonGlow: 0.6, stars: 1, clouds: 0.3, cloudColor: 0x0c1020, aurora: 0, underwater: 0 },
  rig: { hemi: [0x5a6a9a, 0x14100c, 1.4], key: [0x7a98ff, 1.3], keyDir: [0.25, 0.55, -0.8], rim: [0xffa050, 0.35], rimDir: [6, 2, 4], lamp: [0xffd9a0, 0, 8], fog: [0x05060a, 0.012], env: 0.3 },
  grade: { exposure: 1.0, lift: [0.0, 0.0, 0.01], gain: [1.0, 0.98, 1.04], saturation: 0.9, contrast: 1.0, bloom: 0.5, vignette: 0.55 },
  music: { bed: 'home_bed', combat: 'home_bed', boss: 'home_bed' },
};

// canvas poster art (procedural)
function posterTexture(kind, w = 256, h = 384) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const paper = (col) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } };
  const title = (txt, y, size, col) => { g.fillStyle = col; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.fillText(txt, w / 2, y); };
  const skullBase = (cx, cy, s, col) => { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, s, 0, TAU); g.fill(); g.fillRect(cx - s * .6, cy + s * .5, s * 1.2, s * .8); g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx - s * .38, cy - s * .05, s * .22, s * .28, 0, 0, TAU); g.ellipse(cx + s * .38, cy - s * .05, s * .22, s * .28, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(cx, cy + s * .25); g.lineTo(cx - s * .12, cy + s * .5); g.lineTo(cx + s * .12, cy + s * .5); g.fill(); for (let i = -2; i <= 2; i++) g.fillRect(cx + i * s * .2 - 2, cy + s * .75, 4, s * .4); };
  if (kind === 'blaster') { paper('#141824'); g.fillStyle = '#ff7a2f'; g.beginPath(); g.moveTo(40, 230); g.lineTo(190, 200); g.lineTo(220, 215); g.lineTo(200, 245); g.lineTo(120, 250); g.lineTo(110, 290); g.lineTo(70, 290); g.lineTo(60, 250); g.closePath(); g.fill(); for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(255,220,120,.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(215 + i * 6, 210 - i * 4); g.lineTo(250, 190 - i * 10); g.stroke(); } title('DREAM', 80, 56, '#ffd9a0'); title('BLASTER', 130, 56, '#ffd9a0'); title('DON\'T WAKE UP', 350, 28, '#ff7a2f'); }
  else if (kind === 'monsters') { paper('#1a0c10'); g.fillStyle = '#3a0a12'; g.beginPath(); g.arc(128, 200, 90, 0, TAU); g.fill(); g.fillStyle = '#ff3a2a'; for (const [x, y] of [[100, 190], [156, 190]]) { g.beginPath(); g.ellipse(x, y, 14, 8, 0, 0, TAU); g.fill(); } title('NIGHTMARES', 70, 42, '#ff5a3c'); title('THEY KNOW', 320, 30, '#c0c0c0'); title('HIS NAME', 352, 30, '#c0c0c0'); }
  else if (kind === 'stag') { paper('#0e0c14'); skullBase(128, 200, 52, '#d8ccb0'); g.strokeStyle = '#d8ccb0'; g.lineWidth = 9; g.lineCap = 'round'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(128 + sx * 40, 165); g.lineTo(128 + sx * 70, 110); g.lineTo(128 + sx * 95, 60); g.moveTo(128 + sx * 70, 110); g.lineTo(128 + sx * 105, 105); g.moveTo(128 + sx * 55, 135); g.lineTo(128 + sx * 85, 140); g.stroke(); } g.strokeStyle = '#ff5a3c'; g.lineWidth = 6; g.beginPath(); g.moveTo(80, 150); g.lineTo(176, 250); g.moveTo(176, 150); g.lineTo(80, 250); g.stroke(); title('THE HOLLOW STAG', 330, 24, '#ff7a2f'); title('SLAIN', 362, 26, '#ffd9a0'); }
  else if (kind === 'king') { paper('#0c120e'); skullBase(128, 210, 52, '#c8d0b0'); g.fillStyle = '#d4b04a'; g.beginPath(); g.moveTo(80, 165); g.lineTo(80, 120); g.lineTo(100, 145); g.lineTo(116, 108); g.lineTo(128, 140); g.lineTo(140, 108); g.lineTo(156, 145); g.lineTo(176, 120); g.lineTo(176, 165); g.closePath(); g.fill(); g.strokeStyle = '#7dff6a'; g.lineWidth = 6; g.beginPath(); g.moveTo(80, 160); g.lineTo(176, 260); g.moveTo(176, 160); g.lineTo(80, 260); g.stroke(); title('THE ROT KING', 330, 26, '#7dff6a'); title('SLAIN', 362, 26, '#c8d0b0'); }
  else if (kind === 'meg') { paper('#08101a'); g.fillStyle = '#c8d8e0'; g.beginPath(); g.moveTo(30, 150); g.quadraticCurveTo(128, 90, 226, 150); g.quadraticCurveTo(128, 200, 30, 150); g.fill(); g.fillStyle = '#c8d8e0'; g.beginPath(); g.moveTo(30, 170); g.quadraticCurveTo(128, 230, 226, 170); g.quadraticCurveTo(128, 280, 30, 170); g.fill(); g.fillStyle = '#08101a'; for (let i = 0; i < 9; i++) { const x = 45 + i * 22; g.beginPath(); g.moveTo(x, 150); g.lineTo(x + 11, 178); g.lineTo(x + 22, 150); g.fill(); g.beginPath(); g.moveTo(x, 172); g.lineTo(x + 11, 148); g.lineTo(x + 22, 172); g.fill(); } g.strokeStyle = '#4fb7ff'; g.lineWidth = 6; g.beginPath(); g.moveTo(60, 110); g.lineTo(196, 250); g.moveTo(196, 110); g.lineTo(60, 250); g.stroke(); title('MEGALODON', 330, 28, '#4fb7ff'); title('SLAIN', 362, 26, '#c8d8e0'); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export const PARENTS_THEME = { ...THEME, key: 'parents', name: "MUM AND DAD'S ROOM", tagline: 'Safe. For now.',
  rig: { ...THEME.rig, hemi: [0x5f6d98, 0x16120d, 1.5], rim: [0xffb070, 0.45] },
  grade: { ...THEME.grade, saturation: 0.95, vignette: 0.48 },
};

export function build(ctx, tier, opts = {}) {
  const PARENTS = !!opts.parents;   // the opening: mum and dad's room, Knox climbs in between them
  const lod = tier.lod === 1; const r = seeded(2024); const D = new Disposer();
  const group = new THREE.Group(); group.name = 'home'; const SM = shadowMats(D);
  const W = 5.2, H = 2.7, L = 4.4; // room size (x, y, z)

  // ---------- textures ----------
  const wallMap = noiseTexture(256, { octaves: 3, base: [66, 72, 100], range: [8, 8, 10], grain: 6, draw: (g, s) => { g.globalAlpha = .18; g.fillStyle = '#c0c8ff'; for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? 2.2 : 5.5; g.lineTo(x + 16 + Math.cos(a) * rr, y + 16 + Math.sin(a) * rr); } g.closePath(); g.fill(); } g.globalAlpha = 1; } });
  wallMap.repeat.set(6, 3);
  const floorMap = noiseTexture(256, { octaves: 3, base: [78, 58, 40], range: [14, 10, 8], grain: 6, draw: (g, s) => { g.strokeStyle = 'rgba(20,12,6,.7)'; g.lineWidth = 2; for (let y = 0; y < s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); const off = (y / 32) % 2 ? 60 : 0; for (let x = off; x < s; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } g.globalAlpha = .25; g.strokeStyle = '#2a1a0c'; for (let i = 0; i < 80; i++) { const y = Math.random() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (Math.random() - .5) * 6); g.stroke(); } g.globalAlpha = 1; } });
  floorMap.repeat.set(3, 2.5); const floorNrm = normalFromNoise(128, 1.2, 3); floorNrm.repeat.set(3, 2.5);
  const rugMap = noiseTexture(256, { octaves: 3, base: [110, 40, 46], range: [16, 8, 8], grain: 10, draw: (g, s) => { g.strokeStyle = '#e0c060'; g.lineWidth = 6; g.strokeRect(20, 20, s - 40, s - 40); g.lineWidth = 3; g.strokeRect(40, 40, s - 80, s - 80); g.fillStyle = '#e0c060'; for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(64 + i * 32, 64 + k * 32, 4, 0, TAU); g.fill(); } } });
  const blanketMap = noiseTexture(256, { octaves: 3, base: [60, 36, 80], range: [10, 8, 12], grain: 6, draw: (g, s) => { g.fillStyle = '#ffd040'; for (let i = 0; i < 40; i++) { const x = Math.random() * s, y = Math.random() * s; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - Math.PI / 2, rr = k % 2 ? 3 : 7; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); } } });
  blanketMap.repeat.set(2, 3);
  const glow = radialAlphaTexture(128, 0, 1);
  const winGlow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); g.filter = 'blur(4px)'; g.fillStyle = '#fff'; for (const [x, y] of [[14, 14], [70, 14], [14, 70], [70, 70]]) g.fillRect(x, y, 44, 44); return new THREE.CanvasTexture(c); })();
  D.add(wallMap, floorMap, floorNrm, rugMap, blanketMap, glow, winGlow);

  // ---------- materials ----------
  const fogOpts = { fogBase: 0, fogFalloff: 0.3 };
  const wallMat = stdMat({ map: wallMap, roughness: 0.92, color: 0xffffff }, fogOpts);
  const floorMat = stdMat({ map: floorMap, normalMap: floorNrm, normalScale: new THREE.Vector2(.4, .4), roughness: 0.55, color: 0xffffff }, fogOpts);
  const ceilMat = stdMat({ color: 0x9a9cae, roughness: 0.95 }, fogOpts);
  const woodMat = stdMat({ color: 0x7a5232, roughness: 0.6 }, fogOpts);
  const whiteMat = stdMat({ color: 0xd8d4cc, roughness: 0.8 }, fogOpts);
  const rugMat = stdMat({ map: rugMap, roughness: 1, color: 0xffffff }, fogOpts);
  const sheetMat = stdMat({ color: 0xc8ccd8, roughness: 0.95 }, fogOpts);
  const blanketMat = stdMat({ map: blanketMap, roughness: 0.95, color: 0xffffff, side: THREE.DoubleSide }, fogOpts);
  const pillowMat = stdMat({ color: 0xe8e4dc, roughness: 0.95 }, fogOpts);
  const toyMat = stdMat({ color: 0xffffff, roughness: 0.5, vertexColors: true }, fogOpts);
  const paneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.14, 0.26, 0.8), fog: false });
  const sliverMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.5), fog: false });
  const nightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.2, 0.9), fog: false });
  const poolBlue = new THREE.MeshBasicMaterial({ map: winGlow, color: new THREE.Color(0.16, 0.24, 0.62), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const poolWarm = new THREE.MeshBasicMaterial({ map: glow, color: new THREE.Color(0.9, 0.45, 0.14), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  D.add(wallMat, floorMat, ceilMat, woodMat, whiteMat, rugMat, sheetMat, blanketMat, pillowMat, toyMat, paneMat, sliverMat, nightMat, poolBlue, poolWarm);

  // add(): batches geometry per material into one merged mesh (built by flush()); opts.solo keeps a separate mesh
  const batches = new Map();
  const add = (geo, mat, x = 0, y = 0, z = 0, ry = 0, opts = {}) => {
    if (opts.solo) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; if (opts.rx) m.rotation.x = opts.rx; if (opts.rz) m.rotation.z = opts.rz; if (opts.cast) caster(m, SM, tier); m.receiveShadow = opts.receive !== false; if (opts.order !== undefined) m.renderOrder = opts.order; group.add(m); D.add(geo); return m; }
    let b = batches.get(mat); if (!b) { b = { geos: [], cast: false, receive: false, order: undefined }; batches.set(mat, b); }
    b.geos.push(xform(geo, x, y, z, ry, 1, opts.rx || 0, opts.rz || 0)); geo.dispose(); b.cast = b.cast || !!opts.cast; b.receive = b.receive || opts.receive !== false; if (opts.order !== undefined) b.order = opts.order; return null;
  };
  const flush = () => { for (const [mat, b] of batches) { const m = new THREE.Mesh(merge(b.geos), mat); if (b.cast) caster(m, SM, tier); m.receiveShadow = b.receive; if (b.order !== undefined) m.renderOrder = b.order; group.add(m); D.add(m.geometry); } batches.clear(); };

  // ---------- room shell (walls face inward) ----------
  add(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), floorMat, 0, 0, 0);
  add(new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2), ceilMat, 0, H, 0);
  // back wall (-z) with window hole: build as 4 planes around the window
  const win = { x: 0.6, y: 1.55, w: 1.3, h: 1.2 };
  const wallParts = [];
  wallParts.push(new THREE.PlaneGeometry(W, H).translate(0, H / 2, 0)); // back (holed via depth trick: window frame sits in front)
  wallParts.push(new THREE.PlaneGeometry(W, H).rotateY(Math.PI).translate(0, H / 2, 0)); // front
  wallParts.push(new THREE.PlaneGeometry(L, H).rotateY(Math.PI / 2).translate(0, H / 2, 0)); // left (-x)
  wallParts.push(new THREE.PlaneGeometry(L, H).rotateY(-Math.PI / 2).translate(0, H / 2, 0)); // right (+x)
  add(wallParts[0], wallMat, 0, 0, -L / 2); add(wallParts[1], wallMat, 0, 0, L / 2); add(wallParts[2], wallMat, -W / 2, 0, 0); add(wallParts[3], wallMat, W / 2, 0, 0);
  // skirting
  add(merge([new THREE.BoxGeometry(W, .12, .04).translate(0, .06, -L / 2 + .02), new THREE.BoxGeometry(W, .12, .04).translate(0, .06, L / 2 - .02), new THREE.BoxGeometry(.04, .12, L).translate(-W / 2 + .02, .06, 0), new THREE.BoxGeometry(.04, .12, L).translate(W / 2 - .02, .06, 0)]), whiteMat);

  // ---------- window (back wall): frame, panes glowing blue, curtain edges, moon pool on floor ----------
  const wz = -L / 2 + 0.03;
  add(new THREE.PlaneGeometry(win.w, win.h), paneMat, win.x, win.y, wz - 0.01, 0, { receive: false });
  add(merge([new THREE.BoxGeometry(win.w + .16, .08, .1).translate(0, win.h / 2 + .04, 0), new THREE.BoxGeometry(win.w + .16, .08, .1).translate(0, -win.h / 2 - .04, 0), new THREE.BoxGeometry(.08, win.h, .1).translate(-win.w / 2 - .04, 0, 0), new THREE.BoxGeometry(.08, win.h, .1).translate(win.w / 2 + .04, 0, 0), new THREE.BoxGeometry(.05, win.h, .06).translate(0, 0, 0), new THREE.BoxGeometry(win.w, .05, .06).translate(0, 0, 0), new THREE.BoxGeometry(win.w + .3, .06, .22).translate(0, -win.h / 2 - .1, .08)]), whiteMat, win.x, win.y, wz + .04, 0, { cast: true });
  // curtains
  const curtainMat = stdMat({ color: 0x2a2440, roughness: 1 }, fogOpts); D.add(curtainMat);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(.28, win.h + .5, .08, 1, 6, 1), curtainMat, win.x + sx * (win.w / 2 + .2), win.y + .05, wz + .1, 0, { cast: true });
  add(new THREE.PlaneGeometry(1.5, 2.4).rotateX(-Math.PI / 2), poolBlue, win.x + .35, .012, -L / 2 + 1.55, -0.12, { receive: false, order: 2, solo: true });

  // ---------- door (right wall, +x, near the front), ajar with warm sliver ----------
  const door = { z: 1.2, w: .9, h: 2.05 };
  add(merge([new THREE.BoxGeometry(.1, door.h + .1, .1).translate(0, door.h / 2, -door.w / 2 - .05), new THREE.BoxGeometry(.1, door.h + .1, .1).translate(0, door.h / 2, door.w / 2 + .05), new THREE.BoxGeometry(.1, .1, door.w + .2).translate(0, door.h + .05, 0)]), whiteMat, W / 2 - .05, 0, door.z, 0, { cast: true });
  add(new THREE.PlaneGeometry(.22, door.h).rotateY(-Math.PI / 2), sliverMat, W / 2 + .02, door.h / 2, door.z - door.w / 2 + .12, 0, { receive: false });
  const doorMesh = add(new THREE.BoxGeometry(.05, door.h, door.w), woodMat, 0, door.h / 2, door.w / 2, 0, { cast: true, solo: true }); // hinge pivot group below
  const hinge = new THREE.Group(); hinge.position.set(W / 2 - .05, 0, door.z - door.w / 2); hinge.rotation.y = -0.42; hinge.add(doorMesh); group.add(hinge); doorMesh.position.set(0, door.h / 2, door.w / 2);
  { const knob = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), stdMat({ color: 0xd0b060, metalness: .4, roughness: .5 }, fogOpts)); knob.position.set(-.06, 1.0, door.w - .1); hinge.add(knob); D.add(knob.geometry, knob.material); }
  add(new THREE.PlaneGeometry(1.6, 2.4).rotateX(-Math.PI / 2), poolWarm, W / 2 - .7, .012, door.z + .2, 0, { receive: false, order: 2, solo: true });

  // ---------- bed (left wall) ----------
  const bed = PARENTS ? { x: -W / 2 + 1.15, z: -.3, w: 2.0, l: 2.15 } : { x: -W / 2 + .75, z: -.3, w: 1.15, l: 2.1 };
  add(merge([new THREE.BoxGeometry(bed.w + .1, .22, bed.l + .1).translate(0, .32, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => new THREE.BoxGeometry(.08, .32, .08).translate(sx * (bed.w / 2), .16, sz * (bed.l / 2))), new THREE.BoxGeometry(bed.w + .1, .7, .06).translate(0, .75, -bed.l / 2 - .02), new THREE.BoxGeometry(bed.w + .1, .4, .06).translate(0, .55, bed.l / 2 + .02)]), woodMat, bed.x, 0, bed.z, 0, { cast: true });
  add(new THREE.BoxGeometry(bed.w, .2, bed.l, 1, 1, 1), sheetMat, bed.x, .53, bed.z, 0, { cast: true });
  if (PARENTS) { for (const sx of [-1, 1]) add(new THREE.SphereGeometry(.3, 10, 8).scale(1.2, .45, .9), pillowMat, bed.x + sx * .62, .68, bed.z - bed.l / 2 + .38, 0, { cast: true }); }
  else add(new THREE.SphereGeometry(.3, 10, 8).scale(1.3, .45, .9), pillowMat, bed.x, .68, bed.z - bed.l / 2 + .38, 0, { cast: true });
  // blanket: folded top sheet with noise wrinkles, draped over the far side
  { const g = new THREE.PlaneGeometry(bed.w + .3, bed.l * .68, 10, 14).rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); let y = Math.sin(x * 9 + z * 3) * .012 + Math.sin(z * 11 - x * 2) * .01 + Math.cos((x + z) * 15) * .006; if (x < -bed.w / 2 + .02) y -= (-bed.w / 2 + .02 - x) * 1.6; p.setY(i, y); } g.computeVertexNormals(); add(g, blanketMat, bed.x + .02, .655, bed.z + bed.l * .13, 0, { cast: true }); }
  const bedPos = { x: bed.x, y: 0.66, z: bed.z + 0.1 };
  // ---------- sleeping parents (the opening only): a long duvet mound + shoulder + head on each pillow ----------
  if (PARENTS) {
    const hairMat = stdMat({ color: 0x2a2018, roughness: .9 }, fogOpts);
    const skinMat = stdMat({ color: 0xc89b78, roughness: .75 }, fogOpts);
    D.add(hairMat, skinMat);
    for (const sx of [-1, 1]) {
      const px = bed.x + sx * .62;
      // body under the duvet: a low mound running down the bed
      const mound = new THREE.SphereGeometry(.42, 14, 10).scale(1.0, .52, 1.75);
      add(mound, blanketMat, px, .60, bed.z + .34, 0, { cast: true });
      // shoulder rise nearer the pillow
      add(new THREE.SphereGeometry(.26, 12, 9).scale(1.05, .7, 1.0), blanketMat, px, .66, bed.z - .42, 0, { cast: true });
      // head turned slightly inward, toward the middle where Knox will be
      add(new THREE.SphereGeometry(.15, 14, 12).scale(.92, 1.05, 1.0), skinMat, px, .82, bed.z - bed.l / 2 + .42, 0, { cast: true });
      add(new THREE.SphereGeometry(.155, 14, 12).scale(.98, .95, 1.02), hairMat, px - sx * .01, .865, bed.z - bed.l / 2 + .36, 0, { cast: true });
    }
  }

  // ---------- nightstand, lamp, toys, shelf ----------
  add(merge([new THREE.BoxGeometry(.5, .55, .45).translate(0, .275, 0), new THREE.BoxGeometry(.52, .03, .47).translate(0, .56, 0)]), woodMat, bed.x + bed.w / 2 + .38, 0, bed.z - .6, 0, { cast: true });
  // nightlight on the wall by the bed (warm dome)
  const nl = { x: -W / 2 + .06, y: .42, z: bed.z + 1.5 };
  add(new THREE.SphereGeometry(.07, 10, 8, 0, TAU, 0, Math.PI / 2).rotateZ(-Math.PI / 2), nightMat, nl.x, nl.y, nl.z, 0, { receive: false });
  add(new THREE.BoxGeometry(.03, .12, .12), whiteMat, nl.x - .005, nl.y, nl.z);
  // rug
  add(new THREE.CircleGeometry(1.0, 24).rotateX(-Math.PI / 2).scale(1.35, 1, 1), rugMat, .4, .008, .5, 0, { order: 1, solo: true });
  // toys: blocks, toy blaster, a shelf of books
  { const parts = []; const cols = [0xff5040, 0x40a0ff, 0xffd040, 0x50e070, 0xb060ff]; for (let i = 0; i < 7; i++) { parts.push(withColor(xform(new THREE.BoxGeometry(.16, .16, .16), .9 + r.range(-.5, .5), .08, 1.3 + r.range(-.5, .5), r() * TAU, 1), r.pick(cols))); }
    parts.push(withColor(xform(new THREE.BoxGeometry(.42, .12, .1), 1.6, .06, -.9, .8, 1), 0x2a2a30), withColor(xform(new THREE.CylinderGeometry(.04, .05, .3, 8).rotateZ(Math.PI / 2), 1.85, .08, -.72, .8, 1), 0xff7a2f), withColor(xform(new THREE.BoxGeometry(.1, .18, .1), 1.5, .1, -.85, .8, 1), 0x2a2a30)); // toy blaster
    for (let i = 0; i < 9; i++) parts.push(withColor(xform(new THREE.BoxGeometry(.05, .22 + r.range(0, .08), .16), -1.4 + i * .07, 1.62, L / 2 - .12, 0, 1, 0, r.range(-.05, .05)), r.pick(cols))); // books on shelf
    parts.push(withColor(new THREE.BoxGeometry(.9, .03, .2).translate(-1.15, 1.5, L / 2 - .12), 0x5a3a24), withColor(new THREE.BoxGeometry(.9, .03, .2).translate(-1.15, 2.0, L / 2 - .12), 0x5a3a24));
    parts.push(withColor(xform(new THREE.SphereGeometry(.14, 8, 6), -1.3, 2.15, L / 2 - .12, 0, 1), 0x8a5a30), withColor(xform(new THREE.SphereGeometry(.09, 6, 5), -1.3, 2.32, L / 2 - .12, 0, 1), 0x8a5a30)); // teddy on the shelf
    add(merge(parts), toyMat, 0, 0, 0, 0, { cast: true }); }

  flush();

  // ---------- posters ----------
  const posterGeo = new THREE.PlaneGeometry(.62, .93); D.add(posterGeo);
  const posters = [];
  const skipPosters = PARENTS;
  const poster = (kind, x, y, z, ry, tilt = 0, glow = 0) => { if (skipPosters) return; const t = posterTexture(kind); const m = stdMat({ map: t, roughness: .9, color: 0xffffff, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: glow }, fogOpts); const mesh = new THREE.Mesh(posterGeo, m); mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.rotation.z = tilt; mesh.receiveShadow = true; group.add(mesh); D.add(t, m); return mesh; };
  poster('blaster', 0.4, 1.75, L / 2 - .02, Math.PI, .03); poster('monsters', W / 2 - .02, 1.7, -1.3, -Math.PI / 2, -.02);
  posters.push(poster('stag', -0.5, 1.9, -L / 2 + .02, 0, .02, .35), poster('king', 0.5 + 1.15, 1.9, -L / 2 + .02, 0, -.03, .35), poster('meg', W / 2 - .02, 1.7, -0.3, -Math.PI / 2, .02, .35));
  for (let i = posters.length - 1; i >= 0; i--) { if (!posters[i]) posters.splice(i, 1); else posters[i].visible = false; }

  // ---------- star stickers on the ceiling + nightlight halo ----------
  const starTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30); rg.addColorStop(0, 'rgba(255,255,255,.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? 7 : 18; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); } g.closePath(); g.fill(); return new THREE.CanvasTexture(c); })(); D.add(starTex);
  const NS = lod ? 24 : 44; const stars = new Glows(NS + 1, { fogDensity: 0.0, renderOrder: 16, texture: starTex }); group.add(stars.mesh);
  const starState = [];
  for (let i = 0; i < NS; i++) { const x = r.range(-W / 2 + .3, W / 2 - .3), z = r.range(-L / 2 + .3, L / 2 - .3); const ph = r() * 6; starState.push({ x, z, ph }); stars.set(i, x, H - .02, z, 0.6, 1.0, 0.55, r.range(.035, .06), .7); }
  stars.set(NS, nl.x + .1, nl.y, nl.z, 1.0, 0.6, 0.35, .6, .35);

  // point lights: hallway sliver (warm) + nightlight
  const points = ctx.lighting ? ctx.lighting.points : [];
  if (points[0]) { points[0].color.set(0xffa050); points[0].position.set(W / 2 - .25, 1.2, door.z + .1); points[0].intensity = 4.5; points[0].distance = 6; points[0].decay = 1.8; }
  if (points[1]) { points[1].color.set(0xffb080); points[1].position.set(nl.x + .15, nl.y + .05, nl.z); points[1].intensity = 1.6; points[1].distance = 4; points[1].decay = 2; }
  if (ctx.lighting) { const s = ctx.lighting.key.shadow; s.normalBias = 0.02; }
  const prevWind = FOG.wind.value; FOG.wind.value = 0;

  function update(dt, t, playerPos) {
    for (let i = 0; i < NS; i++) { const s = starState[i]; stars.alpha(i, .55 + .25 * Math.sin(t * .8 + s.ph)); }
    stars.alpha(NS, .5 + .06 * Math.sin(t * 9) * Math.sin(t * 3.1));
    if (points[1]) points[1].intensity = 1.6 + .15 * Math.sin(t * 7.3);
  }
  function trophies(n) { posters.forEach((p, i) => p.visible = i < (n | 0)); }
  function dispose() { FOG.wind.value = prevWind; for (const p of points) p.intensity = 0; stars.dispose(); D.dispose(); group.removeFromParent(); }

  return { group, update, dispose, spawnPoints: [], bossSpawn: { x: 0, z: 0 }, obstacles: [], lampsOff() { }, blackout() { }, blackwater() { }, lightning() { }, eyes() { }, trophies, secretPos: null, bedPos };
}
