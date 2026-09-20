// THE HOLLOW WOODS — dead forest under a blood moon. Tree wall, cover trees, leaf-litter ground, dead grass & ferns,
// fallen logs, broken shrines, hanging skulls, ground fog, fireflies and a ring of watching eyes.
import * as THREE from 'three';
import { P } from '../../render/particles.js';
import { FOG } from '../../render/fx.js';
import { dir3, seeded, Disposer, shadowMats, caster, stdMat, xform, merge, roughen, tube, deadTree, rock, groundDisc, scatter, barkTexture, stoneTexture, bladeTexture, eyesTexture, noiseTexture, normalFromNoise, instancer, Glows, FogSheets, TAU } from './common.js';

export const THEME = {
  key: 'forest', name: 'THE HOLLOW WOODS', sub: 'Skinwalkers', tagline: 'Something is wearing the forest.', boss: 'hollowstag', bossName: 'THE HOLLOW STAG', bossTitle: 'NIGHTMARE ALPHA', bossQuote: '"I\'ve been wearing your dreams, Knox."', ammo: 'starfire', accent: 0xff7a2f, radius: 19, underwater: false,
  sky: { zenith: 0x0a0c1e, horizon: 0x3a1a2c, ground: 0x030205, moonColor: 0xff4a2c, moonDir: dir3(-0.5, 0.42, -0.8), moonSize: 0.025, moonGlow: 1.4, stars: 1, clouds: 0.6, cloudColor: 0x241420, aurora: 0, underwater: 0 },
  rig: { hemi: [0x3c4458, 0x0a0806, 1.1], key: [0xffb08c, 2.4], keyDir: [-0.5, 0.6, -0.8], rim: [0x6a7cc0, 0.6], rimDir: [12, 6, 14], lamp: [0xffd9a0, 60, 16], fog: [0x0b0912, 0.045], env: 0.25 },
  grade: { exposure: 1.0, lift: [0.0, 0.0, 0.012], gain: [1.02, 0.95, 1.0], saturation: 0.88, contrast: 1.0, bloom: 0.55, vignette: 0.6 },
  music: { bed: 'forest_bed', combat: 'forest_combat', boss: 'forest_boss' },
};

export function build(ctx, tier) {
  const R = THEME.radius, GR = R + 8; const lod = tier.lod === 1; const r = seeded(4711); const D = new Disposer();
  const group = new THREE.Group(); group.name = 'forest'; const SM = shadowMats(D);
  const obstacles = [];

  // ---------- textures ----------
  const groundMap = noiseTexture(256, { octaves: 5, base: [74, 62, 48], range: [26, 22, 16], grain: 10, draw: (g, s) => { for (let i = 0; i < 260; i++) { const t = Math.random(); g.fillStyle = t < .5 ? `rgba(${110 + (Math.random() * 40) | 0},${78 + (Math.random() * 24) | 0},${34 + (Math.random() * 14) | 0},.7)` : `rgba(${40 + (Math.random() * 16) | 0},${30 + (Math.random() * 10) | 0},${22 + (Math.random() * 8) | 0},.8)`; g.save(); g.translate(Math.random() * s, Math.random() * s); g.rotate(Math.random() * 6.3); g.beginPath(); g.ellipse(0, 0, 3 + Math.random() * 6, 1.5 + Math.random() * 3, 0, 0, 7); g.fill(); g.restore(); } for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(28,24,30,.7)'; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 8 + Math.random() * 22, 5 + Math.random() * 12, Math.random() * 3, 0, 7); g.fill(); } } });
  const groundNrm = normalFromNoise(256, 3.2, 5); groundMap.repeat.set(16, 16); groundNrm.repeat.set(16, 16);
  const bark = barkTexture(256, [70, 64, 58], [30, 26, 22]); const barkNrm = normalFromNoise(128, 2.6, 4); bark.repeat.set(1.5, 1); barkNrm.repeat.set(1.5, 1);
  const stone = stoneTexture(256, [96, 98, 94], [30, 30, 28]); const stoneNrm = normalFromNoise(128, 2, 4);
  const grassTex = bladeTexture(128, '#8a7c50', 'grass'); const fernTex = bladeTexture(128, '#5c7040', 'fern');
  D.add(groundMap, groundNrm, bark, barkNrm, stone, stoneNrm, grassTex, fernTex);

  // ---------- materials ----------
  const fogOpts = { fogBase: 0, fogFalloff: 0.14 };
  const groundMat = stdMat({ map: groundMap, normalMap: groundNrm, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.94, metalness: 0, color: 0xffffff }, fogOpts);
  const barkMat = stdMat({ map: bark, normalMap: barkNrm, normalScale: new THREE.Vector2(1.7, 1.7), roughness: 0.96, color: 0xffffff, vertexColors: true }, { ...fogOpts, wind: true, instanced: true, windHeight: 14 });
  const barkStaticMat = stdMat({ map: bark, normalMap: barkNrm, roughness: 0.96, color: 0xe0dcd6 }, fogOpts);
  const stoneMat = stdMat({ map: stone, normalMap: stoneNrm, normalScale: new THREE.Vector2(.8, .8), roughness: 0.9, color: 0xffffff }, fogOpts);
  const boneMat = stdMat({ roughness: 0.7, color: 0xd8ccb0 }, fogOpts);
  const grassMat = stdMat({ map: grassTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0xc8c0a8 }, { ...fogOpts, wind: true, instanced: true, windHeight: 1 });
  const fernMat = stdMat({ map: fernTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0xd0dcc0 }, { ...fogOpts, wind: true, instanced: true, windHeight: 1.2 });
  D.add(groundMat, barkMat, barkStaticMat, stoneMat, boneMat, grassMat, fernMat);

  // ---------- ground ----------
  const ground = groundDisc(GR, groundMat, lod ? 40 : 64); group.add(ground); D.add(ground.geometry);

  // ---------- trees: 2 variants instanced (wall ring + cover trees) ----------
  const treeGeoA = deadTree(seeded(11), { height: 11, radius: 0.58, radial: lod ? 5 : 7, branches: lod ? 4 : 6, twigs: lod ? 0 : 1, roots: lod ? 3 : 4 });
  const treeGeoB = deadTree(seeded(29), { height: 8.5, radius: 0.5, radial: lod ? 5 : 6, branches: lod ? 3 : 5, twigs: lod ? 0 : 1, roots: 3, lean: 0.22 });
  D.add(treeGeoA, treeGeoB);
  const wallN = Math.round(tier.trees * 1.3), coverN = 7;
  const cover = scatter(r, coverN, 6, R - 3, 5.5, [{ x: 0, z: 0, r: 4 }]);
  const wall = []; { const ringN = wallN; for (let i = 0; i < ringN; i++) { const a = i / ringN * TAU + r.range(-.25, .25); const d = R + 1.6 + r.range(0, 5.2); wall.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, a }); } }
  // second, denser outer ring so nothing peeks through
  { const n2 = Math.round(wallN * 0.8); for (let i = 0; i < n2; i++) { const a = (i + .5) / n2 * TAU + r.range(-.2, .2); const d = R + 6 + r.range(0, 4); wall.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, a }); } }
  const all = [...cover.map(p => ({ ...p, cover: true })), ...wall];
  const nA = Math.ceil(all.length / 2), nB = all.length - nA;
  // the wall sits 23-32 m out, far outside the shadow frustum: drawing it into the depth map cost half the frame's triangles for nothing
  const treesA = instancer(treeGeoA, barkMat, nA); const treesB = instancer(treeGeoB, barkMat, nB);
  const treesC = caster(instancer(treeGeoA, barkMat, coverN), SM, tier);
  treesA.name = 'treesA'; treesB.name = 'treesB';
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), col = new THREE.Color(); let ia = 0, ib = 0, ic = 0;
    all.forEach((p, i) => {
      const useA = i % 2 === 0; const mesh = useA ? treesA : treesB; const idx = useA ? ia++ : ib++;
      let coverIdx = -1; if (p.cover) coverIdx = ic++;
      const s = p.cover ? r.range(0.95, 1.2) : r.range(0.85, 1.35); e.set(r.range(-.05, .05), r() * TAU, r.range(-.05, .05)); q.setFromEuler(e); sc.set(s * r.range(.9, 1.1), s, s * r.range(.9, 1.1));
      m.compose(new THREE.Vector3(p.x, -0.05, p.z), q, sc); mesh.setMatrixAt(idx, m); if (coverIdx >= 0) treesC.setMatrixAt(coverIdx, m);
      const v = r.range(.55, 1); col.setRGB(v * r.range(.85, 1), v * r.range(.8, .95), v * r.range(.75, .9)); mesh.setColorAt(idx, col); if (coverIdx >= 0) treesC.setColorAt(coverIdx, col);
      if (p.cover) obstacles.push({ x: p.x, z: p.z, r: 0.75 * s + 0.25 });
    });
  }
  treesC.count = coverN; group.add(treesA, treesB, treesC);

  // ---------- fallen logs (static merge) ----------
  const woodParts = []; const logs = scatter(r, 4, 5, R - 2, 6, [...cover.map(c => ({ ...c, r: 2 })), { x: 0, z: 0, r: 3 }]);
  for (const L of logs) {
    const len = r.range(4, 6.5), rad = r.range(.3, .42); const pts = []; const radii = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector3(-len / 2 + t * len, rad * .9 + Math.sin(t * 3.1) * .08, Math.sin(t * 2.2) * .25)); radii.push(rad * (1 - t * .35) * (i === 5 ? .6 : 1)); }
    let g = tube(pts, radii, lod ? 6 : 8, { bump: .16, vScale: .35 }); const ang = r() * TAU; g = xform(g, L.x, 0, L.z, ang, 1); woodParts.push(g);
    // broken branch stubs
    for (let k = 0; k < 3; k++) { const t = r.range(.15, .85); const bx = -len / 2 + t * len; const dir = new THREE.Vector3(r.range(-.4, .4), r.range(.4, 1), r.range(-1, 1)).normalize(); const p0 = new THREE.Vector3(bx, rad * .9, 0), p1 = p0.clone().addScaledVector(dir, r.range(.5, 1.1)); woodParts.push(xform(tube([p0, p1], [rad * .35, rad * .12], 5), L.x, 0, L.z, ang, 1)); }
    obstacles.push({ x: L.x + Math.cos(ang) * len * .25, z: L.z - Math.sin(ang) * len * .25, r: rad + .45 }); obstacles.push({ x: L.x - Math.cos(ang) * len * .25, z: L.z + Math.sin(ang) * len * .25, r: rad + .45 });
  }
  // hanging ropes for skulls (wood mesh)
  const skullSpots = [];
  cover.slice(0, 4).forEach((c, i) => { const a = r() * TAU; const ox = Math.cos(a) * 1.6, oz = Math.sin(a) * 1.6; const top = 3.9 + r.range(0, 0.8), len = r.range(1.0, 1.6); skullSpots.push({ x: c.x + ox, z: c.z + oz, y: top - len, bx: c.x, bz: c.z }); woodParts.push(xform(new THREE.CylinderGeometry(.02, .02, len, 4).translate(0, -len / 2, 0), c.x + ox, top, c.z + oz, 0, 1)); woodParts.push(xform(new THREE.CylinderGeometry(.06, .04, 1.9, 4).rotateZ(Math.PI / 2), c.x + ox * .5, top, c.z + oz * .5, -a, 1)); });
  const wood = caster(new THREE.Mesh(merge(woodParts), barkStaticMat), SM, tier); wood.receiveShadow = true; group.add(wood); D.add(wood.geometry);

  // ---------- skulls & bones (static merge) ----------
  const boneParts = [];
  const skull = (s) => { const parts = []; parts.push(new THREE.SphereGeometry(.16 * s, 8, 6).scale(1, .9, 1.1)); parts.push(new THREE.BoxGeometry(.18 * s, .1 * s, .14 * s).translate(0, -.13 * s, .04 * s)); for (const sx of [-1, 1]) parts.push(new THREE.SphereGeometry(.045 * s, 5, 4).translate(sx * .06 * s, -.01 * s, .14 * s)); return merge(parts); };
  for (const s of skullSpots) { boneParts.push(xform(skull(1.1), s.x, s.y, s.z, r() * TAU, 1, r.range(-.3, .3))); }
  // bone piles at the shrines + scattered
  const bone = (l, rad) => merge([new THREE.CylinderGeometry(rad, rad, l, 5), new THREE.SphereGeometry(rad * 1.8, 5, 4).translate(0, l / 2, 0), new THREE.SphereGeometry(rad * 1.8, 5, 4).translate(0, -l / 2, 0)]);
  const shrines = scatter(r, 2, 8, R - 3, 12, [...cover.map(c => ({ ...c, r: 3 })), ...logs.map(l => ({ ...l, r: 5 }))]);
  for (const sh of shrines) { for (let i = 0; i < 6; i++) { boneParts.push(xform(bone(r.range(.3, .55), .035), sh.x + r.range(-1.3, 1.3), .04, sh.z + r.range(-1.3, 1.3), r() * TAU, 1, Math.PI / 2 + r.range(-.2, .2))); } boneParts.push(xform(skull(.9), sh.x + r.range(-1, 1), .15, sh.z + r.range(-1, 1), r() * TAU, 1, r.range(-.5, .5))); }
  // eye sockets for skulls: dark inset spheres handled by normal shading; keep cheap
  const bones = new THREE.Mesh(merge(boneParts), boneMat); bones.castShadow = false; bones.receiveShadow = true; group.add(bones); D.add(bones.geometry);

  // ---------- shrines & rocks (static merge) ----------
  const stoneParts = [];
  for (const sh of shrines) {
    const ang = r() * TAU; const S = (g, x, y, z, ry = 0, rx = 0, rz = 0) => stoneParts.push(xform(roughen(g, .02, 3, r() * 9), sh.x + x, y, sh.z + z, ang + ry, 1, rx, rz));
    S(new THREE.BoxGeometry(2.6, .35, 2.2, 2, 1, 2), 0, .17, 0); S(new THREE.BoxGeometry(1.8, .3, 1.5, 2, 1, 2), 0, .5, 0, .1);
    S(new THREE.BoxGeometry(.45, 1.9, .45, 1, 3, 1), -.6, 1.55, -.45, 0, .06, .05); S(new THREE.BoxGeometry(.45, 1.1, .45, 1, 2, 1), .6, 1.15, -.45, 0, -.08, .2);
    S(new THREE.BoxGeometry(.4, .9, .4), .9, .55, .9, .7, Math.PI / 2 - .3, 0); // fallen pillar piece
    S(new THREE.BoxGeometry(1.2, .25, 1.1), -.2, .75, -.1, .3); S(new THREE.BoxGeometry(.8, .6, .35), 0, 1.0, -.9, 0); // altar slab + back stone
    obstacles.push({ x: sh.x, z: sh.z, r: 1.55 });
  }
  const rocks = scatter(r, lod ? 6 : 10, 4, R + 2, 4, [...cover.map(c => ({ ...c, r: 2 })), ...shrines.map(s => ({ ...s, r: 3 })), ...logs.map(l => ({ ...l, r: 4 }))]);
  for (const rk of rocks) { const s = r.range(.5, 1.3); stoneParts.push(xform(rock(r, s, lod ? 0 : 1, r() * 10), rk.x, -s * .1, rk.z, r() * TAU, 1)); if (Math.hypot(rk.x, rk.z) < R) obstacles.push({ x: rk.x, z: rk.z, r: s * 1.0 }); }
  const stones = caster(new THREE.Mesh(merge(stoneParts), stoneMat), SM, tier); stones.receiveShadow = true; group.add(stones); D.add(stones.geometry);

  // ---------- dead grass & ferns (instanced crossed quads) ----------
  const cross = (w, h) => merge([new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2).translate(0, h / 2, 0)]);
  const grassGeo = cross(.9, .7), fernGeo = cross(1.4, 1.0); D.add(grassGeo, fernGeo);
  const nG = tier.grass, nF = Math.max(20, Math.round(tier.grass / 4));
  const grass = instancer(grassGeo, grassMat, nG); const ferns = instancer(fernGeo, fernMat, nF); grass.receiveShadow = true; ferns.receiveShadow = true;
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < nG; i++) { const a = r() * TAU, d = Math.sqrt(r()) * (R + 4); const s = r.range(.7, 1.4); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(s, s * r.range(.8, 1.3), s)); grass.setMatrixAt(i, m); const v = r.range(.5, 1); col.setRGB(v * r.range(.9, 1.1), v * r.range(.85, 1), v * r.range(.7, .9)); grass.setColorAt(i, col); }
    for (let i = 0; i < nF; i++) { const a = r() * TAU, d = 3 + Math.sqrt(r()) * (R + 3); const s = r.range(.8, 1.5); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(s, s, s)); ferns.setMatrixAt(i, m); const v = r.range(.45, 1); col.setRGB(v * r.range(.8, 1), v, v * r.range(.7, .9)); ferns.setColorAt(i, col); }
  }
  group.add(grass, ferns);

  // ---------- undergrowth backdrop: dark bushy wall that blacks out the horizon between trunks ----------
  const bdTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128); g.fillStyle = '#000'; for (let x = 0; x < 512; x += 2) { const h = 36 + Math.sin(x * .05) * 12 + Math.sin(x * .17) * 8 + Math.sin(x * .61) * 5 + Math.random() * 14; g.fillRect(x, 128 - h, 3, h); } for (let i = 0; i < 140; i++) { const x = Math.random() * 512, y0 = 128 - 30 - Math.random() * 20, h = 8 + Math.random() * 34, w = 1 + Math.random() * 4; g.beginPath(); g.moveTo(x - w, y0); g.lineTo(x + (Math.random() - .5) * 12, y0 - h); g.lineTo(x + w, y0); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 6; return t; })(); D.add(bdTex);
  const bdMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: bdTex, alphaTest: 0.5, side: THREE.BackSide, fog: false }); D.add(bdMat);
  const backdrop = new THREE.Mesh(new THREE.CylinderGeometry(GR + 2.5, GR + 2.5, 9, 48, 1, true).translate(0, 4.5, 0), bdMat); backdrop.renderOrder = 1; group.add(backdrop); D.add(backdrop.geometry);

  // ---------- ground fog sheets ----------
  const fog = new FogSheets(GR, { color: 0x5c6280, alpha: 0.3, heights: [0.25, 0.55, 0.9], speed: 1 }); group.add(fog.group);

  // ---------- eyes in the tree line ----------
  const NE = 16; const eyesTex = eyesTexture(64); D.add(eyesTex);
  const eyes = new Glows(NE, { texture: eyesTex, fogDensity: 0.02, renderOrder: 16 }); group.add(eyes.mesh);
  const eyeState = []; const placeEye = (i) => { const a = r() * TAU, d = R + 3.5 + r.range(0, 4); const e = eyeState[i] || (eyeState[i] = {}); e.x = Math.cos(a) * d; e.z = Math.sin(a) * d; e.y = r.range(0.9, 2.6); e.open = 1; e.next = r.range(2, 7); e.blink = 0; e.hue = r.range(0, 1); e.size = r.range(.32, .5); };
  for (let i = 0; i < NE; i++) placeEye(i);
  let eyeIntensity = 1;
  const eyeCol = new THREE.Color();
  const setEye = (i) => { const e = eyeState[i]; eyeCol.setHSL(0.06 + e.hue * 0.04, 1, 0.55); const a = e.open * eyeIntensity * 2.2; eyes.set(i, e.x, e.y, e.z, eyeCol.r, eyeCol.g, eyeCol.b, e.size * (1 + (1 - e.open) * .2), a); };
  for (let i = 0; i < NE; i++) setEye(i);

  // ---------- spawn points ----------
  const spawnPoints = [0.5, 2.6, 4.7].map(a => ({ x: Math.cos(a) * (R - 1.5), z: Math.sin(a) * (R - 1.5), kind: 'treeline' }));
  const bossSpawn = { x: Math.cos(-Math.PI / 2 - 0.3) * (R - 3), z: Math.sin(-Math.PI / 2 - 0.3) * (R - 3) };

  // ---------- state ----------
  const baseKey = THEME.rig.key[1], baseHemi = THEME.rig.hemi[2], baseGlow = THEME.sky.moonGlow;
  let blackoutV = 0, fireflyAcc = 0, fogAcc = 0;
  const cFire = new THREE.Color(0xd9ff6a), cFire2 = new THREE.Color(0xffc24a), cFog = new THREE.Color(0x1c1a26);
  const prevWind = FOG.wind.value; FOG.wind.value = 0.55;

  function update(dt, t, playerPos) {
    fog.update(t);
    // eyes: blink & drift
    for (let i = 0; i < NE; i++) {
      const e = eyeState[i]; e.next -= dt;
      if (e.blink > 0) { e.blink -= dt; e.open = e.blink > 0.12 ? 0 : 1 - e.blink / 0.12; if (e.blink <= 0) { e.open = 1; if (r() < 0.3) placeEye(i); } setEye(i); }
      else if (e.next <= 0) { e.blink = r.range(0.18, 0.6); e.next = r.range(2, 8); }
      else if (i % 4 === ((t * 60) | 0) % 4) setEye(i);
    }
    // fireflies (additive, faint, die out during blackout)
    if (ctx.particlesAdd && blackoutV < 0.6) {
      fireflyAcc += dt * 5 * (1 - blackoutV);
      while (fireflyAcc > 1) { fireflyAcc -= 1; const a = r() * TAU, d = Math.sqrt(r()) * (R + 2); ctx.particlesAdd.one(Math.cos(a) * d, r.range(.3, 2.4), Math.sin(a) * d, { type: P.DOT, color: r() < .7 ? cFire : cFire2, life: r.range(2.5, 5), size: r.range(.05, .09), sizeEnd: .02, vx: r.range(-.25, .25), vy: r.range(-.08, .18), vz: r.range(-.25, .25), fadeIn: .4, drag: .3 }); }
    }
    // drifting fog puffs around the rim + a few inside
    if (ctx.particlesAlpha) {
      fogAcc += dt * 2.2; // rim only: a SMOKE quad near the camera shows its atlas-cell edge
      while (fogAcc > 1) { fogAcc -= 1; const a = r() * TAU, d = r.range(R + 2, R + 7); ctx.particlesAlpha.one(Math.cos(a) * d, r.range(.2, 1.1), Math.sin(a) * d, { type: P.SMOKE, color: cFog, life: r.range(7, 11), size: r.range(3, 4.5), sizeEnd: r.range(4.5, 6.5), vx: r.range(-.18, .18), vy: r.range(.01, .05), vz: r.range(-.18, .18), fadeIn: .35, spin: r.range(-.1, .1) }); }
    }
  }

  function eyesFn(v) { eyeIntensity = Math.max(0, Math.min(1, v)); for (let i = 0; i < NE; i++) setEye(i); }
  function blackout(v) {
    blackoutV = Math.max(0, Math.min(1, v));
    if (ctx.sky) { ctx.sky.uniforms.blackout.value = blackoutV; ctx.sky.uniforms.moonGlow.value = baseGlow * (1 - blackoutV); }
    if (ctx.lighting) { ctx.lighting.key.intensity = baseKey * (1 - blackoutV * 0.88); ctx.lighting.hemi.intensity = baseHemi * (1 - blackoutV * 0.6); }
    fog.setAlpha(0.42 * (1 - blackoutV * 0.5));
  }

  function dispose() {
    FOG.wind.value = prevWind;
    if (ctx.sky) { ctx.sky.uniforms.blackout.value = 0; ctx.sky.uniforms.moonGlow.value = baseGlow; }
    eyes.dispose(); fog.dispose(); D.dispose(); group.removeFromParent();
  }

  return { group, update, dispose, spawnPoints, bossSpawn, obstacles, lampsOff() { }, blackout, blackwater() { }, lightning() { }, eyes: eyesFn, trophies() { }, secretPos: null };
}
