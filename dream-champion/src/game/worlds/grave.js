// GRAVEROT — overgrown graveyard under a sickly green moon. Uneven rows of gravestones (4 instanced variants), crypts with
// iron gates, a broken chapel at the edge, iron fence ring with dead trees behind, mud + puddles, gas lamps that die one by one,
// thick ground fog, crows, and lightning.
import * as THREE from 'three';
import { P } from '../../render/particles.js';
import { FOG } from '../../render/fx.js';
import { dir3, seeded, Disposer, shadowMats, caster, stdMat, vertexEmissive, xform, merge, withColor, roughen, tube, deadTree, rock, groundDisc, scatter, barkTexture, stoneTexture, bladeTexture, noiseTexture, normalFromNoise, instancer, Glows, FogSheets, TAU } from './common.js';

export const THEME = {
  key: 'grave', name: 'GRAVEROT', sub: 'Zombies', tagline: 'The dead are done waiting.', boss: 'rotking', bossName: 'THE ROT KING', bossTitle: 'LORD OF GRAVEROT', bossQuote: '"Kneel. There\'s a grave with your name on it."', ammo: 'bonesaw', accent: 0x7dff6a, radius: 19, underwater: false,
  sky: { zenith: 0x05080c, horizon: 0x1c2a22, ground: 0x030403, moonColor: 0xb8ffc4, moonDir: dir3(0.55, 0.36, -0.75), moonSize: 0.014, moonGlow: 0.9, stars: 0.6, clouds: 0.6, cloudColor: 0x223026, aurora: 0, underwater: 0 },
  rig: { hemi: [0x4a6a52, 0x0c0e0a, 2.0], key: [0xb8ffc4, 2.8], keyDir: [0.55, 0.85, -0.75], rim: [0x8a7cc8, 1.3], rimDir: [-12, 6, 12], lamp: [0xffd9a0, 60, 16], fog: [0x121a14, 0.046], env: 0.25 },
  grade: { exposure: 1.0, lift: [0.0, 0.006, 0.0], gain: [0.94, 1.04, 0.96], saturation: 0.8, contrast: 1.0, bloom: 0.6, vignette: 0.62 },
  music: { bed: 'grave_bed', combat: 'grave_combat', boss: 'grave_boss' },
};

export function build(ctx, tier) {
  const R = THEME.radius, GR = R + 8; const lod = tier.lod === 1; const r = seeded(9021); const D = new Disposer();
  const group = new THREE.Group(); group.name = 'grave'; const SM = shadowMats(D);
  const obstacles = [];

  // ---------- textures ----------
  const mudMap = noiseTexture(256, { octaves: 5, base: [58, 52, 40], range: [22, 20, 14], grain: 8, draw: (g, s) => { g.globalAlpha = .55; for (let i = 0; i < 70; i++) { g.fillStyle = `rgb(${40 + Math.random() * 20 | 0},${56 + Math.random() * 26 | 0},${30 + Math.random() * 12 | 0})`; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 6 + Math.random() * 20, 4 + Math.random() * 12, Math.random() * 3, 0, 7); g.fill(); } for (let i = 0; i < 40; i++) { g.fillStyle = 'rgb(28,24,20)'; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 5 + Math.random() * 14, 3 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill(); } g.globalAlpha = 1; } });
  const mudNrm = normalFromNoise(256, 3.6, 5); mudMap.repeat.set(14, 14); mudNrm.repeat.set(14, 14);
  const stone = stoneTexture(256, [92, 96, 90], [34, 34, 32]); const stoneNrm = normalFromNoise(128, 2.4, 4);
  const bark = barkTexture(256, [64, 60, 56], [28, 24, 20]); const barkNrm = normalFromNoise(128, 2.6, 4);
  const grassTex = bladeTexture(128, '#6a7048', 'grass'); const puddleNrm = normalFromNoise(128, 0.9, 3);
  D.add(mudMap, mudNrm, stone, stoneNrm, bark, barkNrm, grassTex, puddleNrm);

  // ---------- materials ----------
  const fogOpts = { fogBase: 0, fogFalloff: 0.16 };
  const mudMat = stdMat({ map: mudMap, normalMap: mudNrm, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.9, color: 0xffffff, vertexColors: true }, fogOpts);
  const stoneMat = stdMat({ map: stone, normalMap: stoneNrm, normalScale: new THREE.Vector2(1, 1), roughness: 0.88, color: 0xffffff }, fogOpts);
  const stoneInstMat = stdMat({ map: stone, normalMap: stoneNrm, normalScale: new THREE.Vector2(1, 1), roughness: 0.86, color: 0xffffff }, { ...fogOpts, instanced: true });
  const barkMat = stdMat({ map: bark, normalMap: barkNrm, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.96, color: 0xffffff, vertexColors: true }, fogOpts);
  const ironMat = vertexEmissive(stdMat({ color: 0x2b2826, metalness: 0.7, roughness: 0.55, vertexColors: true, emissive: 0xffb466, emissiveIntensity: 5.5 }, fogOpts)); // lamp glass rides in the iron mesh (vertex colour = emissive gate)
  const puddleMat = stdMat({ color: 0x141a16, metalness: 1.0, roughness: 0.1, normalMap: puddleNrm, normalScale: new THREE.Vector2(.25, .25), envMapIntensity: 2.0, transparent: true, opacity: 0.92, depthWrite: false }, fogOpts);
  const grassMat = stdMat({ map: grassTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0xb8bca0 }, { ...fogOpts, wind: true, instanced: true, windHeight: 1 });
  const crowMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false });
  D.add(mudMat, stoneMat, stoneInstMat, barkMat, ironMat, puddleMat, grassMat, crowMat);


  // ---------- layout anchors ----------
  const crypts = [{ x: -12.5, z: -7.5, a: 0.5 }, { x: 11.5, z: 7, a: Math.PI + 0.35 }];
  const chapel = { x: 13.2, z: -18.6, a: -0.63 };
  const lampPos = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.35; lampPos.push({ x: Math.cos(a) * 10.5, z: Math.sin(a) * 10.5, a }); }
  const avoid = [...crypts.map(c => ({ ...c, r: 3.6 })), ...lampPos.map(l => ({ ...l, r: 1.0 })), { x: 0, z: 0, r: 3.2 }];

  // ---------- gravestones (4 instanced variants) ----------
  const slabShape = (w, h, jag) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); if (!jag) { s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); } else { s.lineTo(w / 2, h * .55); s.lineTo(w * .2, h * .95); s.lineTo(-w * .05, h * .7); s.lineTo(-w * .3, h * .85); s.lineTo(-w / 2, h * .6); } s.lineTo(-w / 2, 0); return s; };
  const ext = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: lod ? 5 : 8 }).translate(0, 0, -depth / 2);
  const plinth = (w, d) => new THREE.BoxGeometry(w, .14, d).translate(0, .07, 0);
  const geoSlab = merge([ext(slabShape(.78, 1.05, false), .18).translate(0, .12, 0), plinth(1.0, .5)]);
  const geoCross = merge([new THREE.BoxGeometry(.22, 1.5, .18).translate(0, .87, 0), new THREE.BoxGeometry(.84, .22, .18).translate(0, 1.15, 0), new THREE.BoxGeometry(.5, .22, .5).translate(0, .23, 0), plinth(.8, .8)]);
  const geoObelisk = merge([new THREE.CylinderGeometry(.13, .24, 1.9, 4).rotateY(Math.PI / 4).translate(0, 1.25, 0), new THREE.ConeGeometry(.13, .28, 4).rotateY(Math.PI / 4).translate(0, 2.33, 0), new THREE.BoxGeometry(.7, .3, .7).translate(0, .3, 0), plinth(.95, .95)]);
  const geoCracked = merge([ext(slabShape(.8, 1.0, true), .17).translate(0, .1, 0), new THREE.BoxGeometry(.5, .16, .34).translate(.55, .08, .35).rotateY(.6), plinth(1.0, .5)]);
  for (const g of [geoSlab, geoCross, geoObelisk, geoCracked]) { roughen(g, .012, 6, 3); D.add(g); }
  const stones = []; // {x,z,a,kind}
  for (let zr = -17; zr <= 17; zr += 3.3) for (let xr = -19; xr <= 19; xr += 2.5) {
    if (r() < 0.38) continue; const x = xr + r.range(-.7, .7), z = zr + r.range(-.5, .5); const d = Math.hypot(x, z); if (d < 3.6 || d > R + 1.5) continue;
    let ok = true; for (const q of avoid) if ((q.x - x) ** 2 + (q.z - z) ** 2 < q.r * q.r) { ok = false; break; } if (!ok) continue;
    stones.push({ x, z, a: r.range(-.25, .25) + (zr > 0 ? Math.PI : 0), kind: r.pick([0, 0, 0, 1, 2, 3, 3]), s: r.range(.85, 1.2), tilt: r.range(-.16, .16) * (r() < .5 ? 1 : .2) });
  }
  const byKind = [0, 1, 2, 3].map(k => stones.filter(s => s.kind === k));
  const stoneMeshes = [geoSlab, geoCross, geoObelisk, geoCracked].map((g, k) => { const im = caster(instancer(g, stoneInstMat, Math.max(1, byKind[k].length)), SM, tier); im.name = 'graves' + k; return im; });
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    byKind.forEach((list, k) => list.forEach((s, i) => { e.set(s.tilt, s.a, s.tilt * .5); q.setFromEuler(e); m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.s, s.s, s.s)); stoneMeshes[k].setMatrixAt(i, m); const v = r.range(.7, 1), mossy = r() < .45; col.setRGB(v * (mossy ? .8 : 1), v * (mossy ? 1 : .98), v * (mossy ? .75 : .95)); stoneMeshes[k].setColorAt(i, col); if (Math.hypot(s.x, s.z) < R) obstacles.push({ x: s.x, z: s.z, r: 0.42 * s.s }); }));
  }
  group.add(...stoneMeshes);

  // ---------- grave mounds, open pits, crypt doorways (mud material with vertex colour) ----------
  const mudParts = [withColor(new THREE.CircleGeometry(GR, lod ? 40 : 64).rotateX(-Math.PI / 2), 0xffffff)]; // arena floor + mounds/pits/doorways in one mesh
  const spawnStones = stones.filter(s => { const d = Math.hypot(s.x, s.z); return d > 6 && d < R - 3; });
  const spawnPick = []; for (let i = 0; i < 6 && spawnStones.length; i++) { const idx = Math.floor(r() * spawnStones.length); const s = spawnStones.splice(idx, 1)[0]; spawnPick.push(s); }
  for (const s of stones) {
    const fx = Math.sin(s.a), fz = Math.cos(s.a); const mx = s.x + fx * 1.05, mz = s.z + fz * 1.05; // in front of the stone
    if (spawnPick.includes(s)) { mudParts.push(withColor(xform(new THREE.PlaneGeometry(1.0, 1.9).rotateX(-Math.PI / 2), mx, .03, mz, s.a, 1), 0x000000)); mudParts.push(withColor(xform(new THREE.TorusGeometry(1.05, .16, 4, 10).rotateX(Math.PI / 2).scale(.55, 1, 1), mx, .0, mz, s.a, 1), 0xffffff)); s.spawn = { x: mx, z: mz }; }
    else if (Math.hypot(s.x, s.z) < R + 1) mudParts.push(withColor(xform(new THREE.SphereGeometry(1, lod ? 6 : 8, lod ? 4 : 5).scale(.48, .17, .95), mx, -.03, mz, s.a, s.s), 0xffffff));
  }
  for (const c of crypts) mudParts.push(withColor(xform(new THREE.PlaneGeometry(1.2, 2.2), c.x + Math.sin(c.a) * 1.72, 1.15, c.z + Math.cos(c.a) * 1.72, c.a, 1), 0x000000));
  const mud = new THREE.Mesh(merge(mudParts), mudMat); mud.receiveShadow = true; mud.renderOrder = 0; group.add(mud); D.add(mud.geometry);

  // ---------- crypts + chapel + rocks (stone static) ----------
  const stoneParts = [];
  const gable = (w, h, d) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0); return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2); };
  for (const c of crypts) {
    const S = (g, x, y, z, ry = 0, rx = 0, rz = 0) => stoneParts.push(xform(g, c.x + Math.cos(c.a) * x + Math.sin(c.a) * z, y, c.z - Math.sin(c.a) * x + Math.cos(c.a) * z, c.a + ry, 1, rx, rz));
    S(new THREE.BoxGeometry(4, 3, 3.4), 0, 1.5, 0); S(new THREE.BoxGeometry(4.5, .35, 3.9), 0, 3.15, 0); S(gable(4.5, 1.3, 3.9), 0, 3.32, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S(new THREE.BoxGeometry(.4, 3.1, .4), sx * 1.95, 1.55, sz * 1.62);
    S(new THREE.BoxGeometry(2.2, .25, 1.0), 0, .12, 2.1); S(new THREE.BoxGeometry(1.8, .25, .6), 0, .36, 1.85); // steps
    S(new THREE.BoxGeometry(.18, .9, .18), 0, 5.05, 0); S(new THREE.BoxGeometry(.55, .18, .18), 0, 5.2, 0); // cross
    for (const sx of [-1, 1]) S(new THREE.BoxGeometry(.45, .55, .45), sx * 1.2, 1.0, 1.95); // urns
    S(new THREE.BoxGeometry(1.8, 2.5, .2), 0, 1.25, 1.62); // door lintel/frame slab
    obstacles.push({ x: c.x, z: c.z, r: 2.4 }); obstacles.push({ x: c.x + Math.cos(c.a) * 1.6, z: c.z - Math.sin(c.a) * 1.6, r: 1.9 }); obstacles.push({ x: c.x - Math.cos(c.a) * 1.6, z: c.z + Math.sin(c.a) * 1.6, r: 1.9 });
  }
  { const c = chapel; const S = (g, x, y, z, ry = 0, rx = 0, rz = 0) => stoneParts.push(xform(g, c.x + Math.cos(c.a) * x + Math.sin(c.a) * z, y, c.z - Math.sin(c.a) * x + Math.cos(c.a) * z, c.a + ry, 1, rx, rz));
    S(new THREE.BoxGeometry(10, 7.5, 6.5), 0, 3.75, 0); S(gable(7.2, 3.2, 10.2), 0, 7.5, 0, Math.PI / 2); S(new THREE.BoxGeometry(3.4, 13, 3.4), -6.3, 6.5, 0); S(new THREE.ConeGeometry(2.4, 5, 4), -6.3, 15.4, 0, Math.PI / 4);
    S(new THREE.BoxGeometry(.9, 5, 1.1), 5.2, 2.5, 3.0); S(new THREE.BoxGeometry(3.5, 2.2, 1.1), 3.9, 1.1, 3.0, 0, 0, .25); // broken wall + rubble
    for (let i = 0; i < 5; i++) S(new THREE.BoxGeometry(r.range(.6, 1.4), r.range(.4, .9), r.range(.6, 1.2)), r.range(-2, 5), .3, r.range(3.6, 5.5), r() * 3, r.range(-.3, .3), r.range(-.3, .3));
  }
  const rocks = scatter(r, lod ? 5 : 8, 5, R + 3, 4, [...avoid, ...stones.map(s => ({ ...s, r: 1.3 }))]);
  for (const rk of rocks) { const s = r.range(.4, .9); stoneParts.push(xform(rock(r, s, lod ? 0 : 1, r() * 10), rk.x, -s * .1, rk.z, r() * TAU, 1)); if (Math.hypot(rk.x, rk.z) < R) obstacles.push({ x: rk.x, z: rk.z, r: s * .95 }); }
  const stoneMesh = caster(new THREE.Mesh(merge(stoneParts), stoneMat), SM, tier); stoneMesh.receiveShadow = true; group.add(stoneMesh); D.add(stoneMesh.geometry);

  // ---------- iron: fence ring, gates, lamp posts (static) ----------
  const ironParts = lampPos.map(L => withColor(xform(new THREE.BoxGeometry(.3, .42, .3), L.x, 3.4, L.z, L.a, 1), 0xffffff)); // lamp glass first: 24 verts each
  ironParts.push(withColor(xform(new THREE.PlaneGeometry(1.2, 2.6), chapel.x + Math.cos(chapel.a) * 5.02, 4.2, chapel.z - Math.sin(chapel.a) * 5.02, chapel.a + Math.PI / 2, 1), 0x1a3a1a)); // chapel window glow
  const ironPush = (g) => ironParts.push(withColor(g, 0x000000));
  { const FR = R + 2.2, n = lod ? 60 : 84; const seg = TAU / n;
    for (let i = 0; i < n; i++) { const a = i * seg; const x = Math.cos(a) * FR, z = Math.sin(a) * FR; const lean = r() < .12 ? r.range(-.2, .2) : 0; const gap = r() < .07;
      ironPush(xform(merge([new THREE.BoxGeometry(.1, 1.9, .1).translate(0, .95, 0), new THREE.ConeGeometry(.09, .28, 4).translate(0, 2.0, 0), new THREE.BoxGeometry(.24, .12, .24).translate(0, .06, 0)]), x, 0, z, -a, 1, lean, 0));
      if (gap) continue; const am = a + seg / 2, L = 2 * FR * Math.sin(seg / 2);
      const bars = [new THREE.BoxGeometry(L, .06, .05).translate(0, .55, 0), new THREE.BoxGeometry(L, .06, .05).translate(0, 1.5, 0)]; for (let b = 1; b <= 3; b++) if (r() > .08) bars.push(new THREE.BoxGeometry(.035, 1.75, .035).translate(-L / 2 + b * L / 4, .95, 0));
      ironPush(xform(merge(bars), Math.cos(am) * FR, 0, Math.sin(am) * FR, -am + Math.PI / 2, 1)); }
  }
  for (const c of crypts) { const bars = []; for (let b = 0; b < 5; b++) bars.push(new THREE.BoxGeometry(.04, 2.2, .04).translate(-.5 + b * .25, 1.1, 0)); bars.push(new THREE.BoxGeometry(1.15, .05, .05).translate(0, .5, 0), new THREE.BoxGeometry(1.15, .05, .05).translate(0, 1.8, 0)); ironPush(xform(merge(bars), c.x + Math.sin(c.a) * 1.75, 0, c.z + Math.cos(c.a) * 1.75, c.a + .18, 1)); }
  for (const L of lampPos) { ironPush(xform(merge([new THREE.CylinderGeometry(.06, .1, 3.1, 6).translate(0, 1.55, 0), new THREE.CylinderGeometry(.22, .22, .12, 8).translate(0, .06, 0), new THREE.BoxGeometry(.42, .08, .42).translate(0, 3.12, 0), new THREE.BoxGeometry(.05, .5, .05).translate(.18, 3.4, .18), new THREE.BoxGeometry(.05, .5, .05).translate(-.18, 3.4, .18), new THREE.BoxGeometry(.05, .5, .05).translate(.18, 3.4, -.18), new THREE.BoxGeometry(.05, .5, .05).translate(-.18, 3.4, -.18), new THREE.ConeGeometry(.32, .3, 4).rotateY(Math.PI / 4).translate(0, 3.78, 0)]), L.x, 0, L.z, L.a, 1)); obstacles.push({ x: L.x, z: L.z, r: .3 }); }
  const iron = new THREE.Mesh(merge(ironParts), ironMat); if (!lod) caster(iron, SM, tier); iron.receiveShadow = true; group.add(iron); D.add(iron.geometry);

  // ---------- lamp state (glass vertex colours live in the iron mesh) + halos + point lights ----------
  const glassColor = iron.geometry.attributes.color; const lampVertsPer = 24; // box = 24 verts, lamps are the first parts
  const lampOn = lampPos.map(() => 1); const lampFlick = lampPos.map(() => r() * 10);
  const halos = new Glows(lampPos.length, { fogDensity: 0.03, renderOrder: 16 }); group.add(halos.mesh);
  const haloCol = new THREE.Color(0xffa040);
  const setLamp = (i, on) => { lampOn[i] = on; for (let v = 0; v < lampVertsPer; v++) glassColor.setXYZ(i * lampVertsPer + v, on, on, on); glassColor.needsUpdate = true; halos.set(i, lampPos[i].x, 3.42, lampPos[i].z, haloCol.r, haloCol.g, haloCol.b, 2.2, on ? .55 : 0); };
  lampPos.forEach((_, i) => setLamp(i, 1));
  const points = ctx.lighting ? ctx.lighting.points : []; for (const p of points) { p.color.set(0xffb466); p.distance = 11; p.decay = 1.6; p.intensity = 0; }

  // ---------- puddles ----------
  const puddleParts = []; const puddles = scatter(r, lod ? 4 : 7, 3, R + 2, 3.0, [...avoid.map(a => ({ ...a, r: a.r * .6 })), ...stones.map(s => ({ ...s, r: 0.2 }))]);
  for (const p of puddles) { const g = new THREE.CircleGeometry(1, 20); const pa = g.attributes.position; for (let i = 1; i < pa.count; i++) { const a = Math.atan2(pa.getY(i), pa.getX(i)); const k = 1 + Math.sin(a * 3 + p.a) * .25 + Math.sin(a * 5 + 1) * .12; pa.setXY(i, pa.getX(i) * k, pa.getY(i) * k); } g.rotateX(-Math.PI / 2); puddleParts.push(xform(g, p.x, .015, p.z, r() * TAU, new THREE.Vector3(r.range(1.4, 2.6), 1, r.range(1.0, 1.8)))); }
  const puddleMesh = new THREE.Mesh(merge(puddleParts), puddleMat); puddleMesh.receiveShadow = true; puddleMesh.renderOrder = 1; group.add(puddleMesh); D.add(puddleMesh.geometry);

  // ---------- dead trees behind the fence (static merge, vertex grime) ----------
  const treeParts = []; const nT = Math.max(16, Math.round(tier.trees * 0.8));
  for (let i = 0; i < nT; i++) { const a = i / nT * TAU + r.range(-.2, .2); const d = R + 4.5 + r.range(0, 5); const g = deadTree(seeded(100 + i), { height: r.range(7, 11), radial: lod ? 5 : 6, branches: lod ? 3 : 5, twigs: lod ? 0 : 1, roots: 3 }); const s = r.range(.9, 1.3); treeParts.push(xform(g, Math.cos(a) * d, -.05, Math.sin(a) * d, r() * TAU, new THREE.Vector3(s, s, s))); }
  const trees = caster(new THREE.Mesh(merge(treeParts), barkMat), SM, tier); trees.receiveShadow = true; group.add(trees); D.add(trees.geometry);
  // undergrowth backdrop behind the trees
  const bdTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128); g.fillStyle = '#000'; for (let x = 0; x < 512; x += 2) { const h = 30 + Math.sin(x * .05) * 10 + Math.sin(x * .17) * 7 + Math.sin(x * .61) * 5 + Math.random() * 14; g.fillRect(x, 128 - h, 3, h); } for (let i = 0; i < 120; i++) { const x = Math.random() * 512, y0 = 128 - 26 - Math.random() * 18, h = 6 + Math.random() * 30, w = 1 + Math.random() * 4; g.beginPath(); g.moveTo(x - w, y0); g.lineTo(x + (Math.random() - .5) * 10, y0 - h); g.lineTo(x + w, y0); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 6; return t; })(); D.add(bdTex);
  const bdMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: bdTex, alphaTest: 0.5, side: THREE.BackSide, fog: true }); D.add(bdMat);
  const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(GR + 3, GR + 3, 8, 48, 1, true).translate(0, 4, 0), bdMat); backdrop.renderOrder = 1; group.add(backdrop); D.add(backdrop.geometry);

  // ---------- dead grass (instanced) ----------
  const grassGeo = merge([new THREE.PlaneGeometry(.9, .6).translate(0, .3, 0), new THREE.PlaneGeometry(.9, .6).rotateY(Math.PI / 2).translate(0, .3, 0)]); D.add(grassGeo);
  const nG = Math.round(tier.grass * 0.6); const grass = instancer(grassGeo, grassMat, nG); grass.receiveShadow = true;
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < nG; i++) { const a = r() * TAU, d = Math.sqrt(r()) * (R + 3); const s = r.range(.7, 1.5); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(s, s * r.range(.5, .9), s)); grass.setMatrixAt(i, m); const v = r.range(.45, 1); col.setRGB(v * r.range(.8, 1), v, v * r.range(.6, .85)); grass.setColorAt(i, col); }
  }
  group.add(grass);

  // ---------- crows (instanced V quads) ----------
    const NC = 7; const crowGeo = (() => { const g = new THREE.BufferGeometry(); const v = [0, 0, -.14, .58, .06, -.02, .58, .06, .16, 0, 0, .1, 0, 0, -.14, -.58, .06, -.02, -.58, .06, .16, 0, 0, .1]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(16), 2)); g.computeVertexNormals(); return g; })(); D.add(crowGeo);
  const crows = instancer(crowGeo, crowMat, NC, { receiveShadow: false }); group.add(crows);
  const crowState = []; let crowTimer = 4;
  const crowM = new THREE.Matrix4(), crowQ = new THREE.Quaternion(), crowE = new THREE.Euler(), crowV = new THREE.Vector3(), crowS = new THREE.Vector3();
  for (let i = 0; i < NC; i++) { crowState.push({ t: 99, dur: 1 }); crowM.makeScale(0, 0, 0); crows.setMatrixAt(i, crowM); }
  const launchCrows = () => { const a = r() * TAU, n = 3 + r.int(0, NC - 3); for (let i = 0; i < n; i++) { const c = crowState[i]; c.t = -r.range(0, 1.2); c.dur = r.range(6, 9); c.a = a + r.range(-.25, .25); c.y = r.range(9, 16); c.off = r.range(-3, 3); c.flap = r.range(6, 9); c.ph = r() * 6; } };

  // ---------- ground fog ----------
  const fog = new FogSheets(GR, { color: 0x5a6a5c, alpha: 0.34, heights: [0.25, 0.55, 0.9], speed: 1.2 }); group.add(fog.group);

  // ---------- spawn points ----------
  const spawnPoints = spawnPick.map(s => ({ x: s.spawn.x, z: s.spawn.z, kind: 'grave' }));
  while (spawnPoints.length < 3) { const a = r() * TAU; spawnPoints.push({ x: Math.cos(a) * 10, z: Math.sin(a) * 10, kind: 'grave' }); }
  const bossSpawn = { x: 1.5, z: -R + 3.5 };

  // ---------- state ----------
  const baseKey = THEME.rig.key[1]; let lightningT = -1; let fogAcc = 0; const cFog = new THREE.Color(0x1a2420);
  const prevWind = FOG.wind.value; FOG.wind.value = 0.4; const tmp = new THREE.Vector3();

  function update(dt, t, playerPos) {
    fog.update(t);
    // lamps: flicker + assign the two pooled point lights to the nearest lit lamps
    let best = [-1, -1], bd = [1e9, 1e9];
    for (let i = 0; i < lampPos.length; i++) { if (!lampOn[i]) continue; const d = (lampPos[i].x - playerPos.x) ** 2 + (lampPos[i].z - playerPos.z) ** 2; if (d < bd[0]) { bd[1] = bd[0]; best[1] = best[0]; bd[0] = d; best[0] = i; } else if (d < bd[1]) { bd[1] = d; best[1] = i; } }
    for (let k = 0; k < points.length; k++) { const p = points[k], i = best[k]; if (i < 0) { p.intensity = 0; continue; } const f = 0.8 + 0.2 * Math.sin(t * 75 + lampFlick[i]) * Math.sin(t * 31 + lampFlick[i] * 2); p.position.set(lampPos[i].x, 3.3, lampPos[i].z); p.intensity = 26 * f; }
    for (let i = 0; i < lampPos.length; i++) if (lampOn[i]) { const f = 0.75 + 0.25 * Math.sin(t * 75 + lampFlick[i]) * Math.sin(t * 31 + lampFlick[i] * 2); halos.alpha(i, .55 * f); }
    // lightning: two flashes
    if (lightningT >= 0) { lightningT += dt; const on = (lightningT < .15) || (lightningT > .25 && lightningT < .4); const v = on ? 1.0 : 0; if (ctx.sky) ctx.sky.uniforms.lightning.value = v; if (ctx.lighting) { ctx.lighting.key.intensity = baseKey + v * 12; ctx.lighting.hemi.intensity = THEME.rig.hemi[2] * (1 + v * 2.5); } if (lightningT > .45) { lightningT = -1; if (ctx.sky) ctx.sky.uniforms.lightning.value = 0; if (ctx.lighting) { ctx.lighting.key.intensity = baseKey; ctx.lighting.hemi.intensity = THEME.rig.hemi[2]; } } }
    // crows
    crowTimer -= dt; if (crowTimer <= 0) { crowTimer = r.range(11, 22); launchCrows(); }
    for (let i = 0; i < NC; i++) { const c = crowState[i]; if (c.t > c.dur) continue; c.t += dt; if (c.t < 0) continue; const u = c.t / c.dur; const dirx = Math.cos(c.a), dirz = Math.sin(c.a); const px = -dirx * 40 + dirx * 80 * u + -dirz * c.off, pz = -dirz * 40 + dirz * 80 * u + dirx * c.off; const flap = Math.sin(t * c.flap + c.ph); crowE.set(0, -c.a, flap * .5); crowQ.setFromEuler(crowE); crowV.set(px, c.y + Math.sin(t * .7 + c.ph) * .6, pz); crowS.set(1, 1, 1 - Math.abs(flap) * .4); crowM.compose(crowV, crowQ, crowS); crows.setMatrixAt(i, crowM); if (c.t > c.dur) { crowM.makeScale(0, 0, 0); crows.setMatrixAt(i, crowM); } }
    crows.instanceMatrix.needsUpdate = true;
    // fog puffs
    // fog puffs drift between the trees beyond the fence (never near the camera: the SMOKE atlas cell has a hard edge up close)
    if (ctx.particlesAlpha) { fogAcc += dt * 2.5; while (fogAcc > 1) { fogAcc -= 1; const a = r() * TAU, d = r.range(R + 2.5, R + 7); ctx.particlesAlpha.one(Math.cos(a) * d, r.range(.2, 1.2), Math.sin(a) * d, { type: P.SMOKE, color: cFog, life: r.range(7, 12), size: r.range(3, 4.5), sizeEnd: r.range(4.5, 6.5), vx: r.range(-.15, .15), vy: r.range(.0, .04), vz: r.range(-.15, .15), fadeIn: .35, spin: r.range(-.08, .08) }); } }
  }

  function lampsOff(n) { const N = Math.max(0, Math.min(lampPos.length, n | 0)); for (let i = 0; i < lampPos.length; i++) setLamp(i, i < N ? 0 : 1); }
  function lightning() { lightningT = 0; }
  function dispose() {
    FOG.wind.value = prevWind; for (const p of points) p.intensity = 0;
    if (ctx.sky) ctx.sky.uniforms.lightning.value = 0; if (ctx.lighting) ctx.lighting.key.intensity = baseKey;
    halos.dispose(); fog.dispose(); D.dispose(); group.removeFromParent();
  }

  return { group, update, dispose, spawnPoints, bossSpawn, obstacles, lampsOff, blackout() { }, blackwater() { }, lightning, eyes() { }, trophies() { }, secretPos: null, lamps: lampPos };
}
