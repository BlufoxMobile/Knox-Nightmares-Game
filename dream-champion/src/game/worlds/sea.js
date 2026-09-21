// THE DROWN — deep sea floor. Silt ground with caustics, coral and kelp, a sunken hull and anchor chain, rock spires,
// the abyss beyond the rim, god-ray cones, bubbles, silt, bioluminescent plants, a water surface seen from below, and the
// half-buried console easter egg.
import * as THREE from 'three';
import { P } from '../../render/particles.js';
import { FOG } from '../../render/fx.js';
import { dir3, seeded, Disposer, shadowMats, caster, stdMat, vertexEmissive, xform, merge, withColor, roughen, tube, deadTree, rock, groundDisc, scatter, stoneTexture, noiseTexture, normalFromNoise, instancer, Glows, TAU } from './common.js';

export const THEME = {
  key: 'sea', name: 'THE DROWN', sub: 'Sharks & Megalodon', tagline: 'Ten thousand feet of teeth.', boss: 'megalodon', bossName: 'MEGALODON', bossTitle: 'THE THING BENEATH', bossQuote: '', ammo: 'depth', accent: 0x4fb7ff, radius: 19, underwater: true,
  sky: { zenith: 0x2a80b0, horizon: 0x03202e, ground: 0x010306, moonColor: 0x9fe6ff, moonDir: dir3(0.12, 0.96, 0.2), moonSize: 0.08, moonGlow: 1.8, stars: 0, clouds: 0, cloudColor: 0x000000, aurora: 0, underwater: 1 },
  rig: { hemi: [0x2c7a9c, 0x06161e, 1.2], key: [0x6fc8ff, 2.6], keyDir: [0.15, 0.95, 0.2], rim: [0x2fffc8, 0.6], rimDir: [-12, 4, 12], lamp: [0xbfe8ff, 50, 12], fog: [0x03202e, 0.05], env: 0.35 },
  grade: { exposure: 1.0, lift: [0.0, 0.004, 0.012], gain: [0.9, 1.0, 1.08], saturation: 0.95, contrast: 1.0, bloom: 0.7, vignette: 0.6 },
  music: { bed: 'sea_bed', combat: 'sea_combat', boss: 'sea_boss' },
};

const RAY_VS = `varying vec2 vUv; varying float vFres; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * normal); vec3 v = normalize(cameraPosition - w.xyz); vFres = abs(dot(n, v)); gl_Position = projectionMatrix * viewMatrix * w; }`;
const RAY_FS = `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uSeed; varying vec2 vUv; varying float vFres;
void main(){ float a = smoothstep(0., .3, vUv.y) * vUv.y * (0.3 + 0.7 * vFres) * uAlpha * (0.75 + 0.25 * sin(uTime * .6 + uSeed) * sin(uTime * 1.3 + uSeed * 2.)); gl_FragColor = vec4(uColor * a, a); }`;

const WATER_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FS = `uniform float uTime; uniform vec3 uColor; uniform vec3 uSunColor; uniform vec3 uSunDir; uniform vec3 uFogColor; uniform float uFogDensity; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float hgt(vec2 p){ return n(p + uTime * vec2(.06, .035)) * .55 + n(p * 2.7 - uTime * vec2(.05, .08)) * .3 + n(p * 6.1 + uTime * vec2(-.02, .05)) * .15; }
void main(){ vec2 p = vW.xz * .11; float e = .08; float c = hgt(p); vec2 g = vec2(hgt(p + vec2(e, 0.)) - c, hgt(p + vec2(0., e)) - c) / e;
  vec3 N = normalize(vec3(-g.x * .35, -1., -g.y * .35)); vec3 V = normalize(cameraPosition - vW); vec3 R = reflect(-V, N);
  float spot = pow(max(dot(-R, normalize(uSunDir)), 0.), 24.); float glint = pow(c, 6.) * 3.; float fres = pow(1. - abs(dot(V, vec3(0., -1., 0.))), 2.5);
  vec3 col = uColor * (.5 + c * .8) + uSunColor * (spot * 2.2 + glint * .6) + uColor * fres * 1.5;
  float d = length(cameraPosition - vW); float ff = 1. - exp(-uFogDensity * uFogDensity * d * d * .22); col = mix(col, uFogColor * 1.6, clamp(ff, 0., 1.));
  gl_FragColor = vec4(col, 1.0); }`;

export function build(ctx, tier) {
  const R = THEME.radius, GR = R + 8; const lod = tier.lod === 1; const r = seeded(7331); const D = new Disposer();
  const group = new THREE.Group(); group.name = 'sea'; const SM = shadowMats(D);
  const obstacles = [];
  // Camera-only blockers. Anything upright the LENS can end up behind, including the props the player is
  // meant to walk through and the ones outside the play radius (the camera trails 5-6 m, so at the rim it
  // sits in the coral band beyond it). r/h are the drawn footprint and height, not a collision volume.
  const camBlockers = [];

  // ---------- textures ----------
  const sandMap = noiseTexture(256, { octaves: 5, base: [98, 94, 82], range: [22, 20, 18], grain: 8, draw: (g, s) => { g.globalAlpha = .35; g.strokeStyle = '#6a6858'; g.lineWidth = 3; for (let i = 0; i < 26; i++) { const y = i / 26 * s; g.beginPath(); for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x * .07 + i) * 5 + Math.sin(x * .19) * 2); g.stroke(); } g.globalAlpha = .5; for (let i = 0; i < 40; i++) { g.fillStyle = '#4a5a50'; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 3 + Math.random() * 9, 2 + Math.random() * 5, Math.random() * 3, 0, 7); g.fill(); } g.globalAlpha = 1; } });
  const sandNrm = normalFromNoise(256, 3.0, 5); sandMap.repeat.set(12, 12); sandNrm.repeat.set(12, 12);
  const rockTex = stoneTexture(256, [64, 72, 74], [26, 26, 24]); const rockNrm = normalFromNoise(128, 2.6, 4);
  const woodTex = noiseTexture(128, { octaves: 4, base: [58, 50, 40], range: [22, 18, 14], grain: 10, draw: (g, s) => { g.globalAlpha = .5; g.strokeStyle = '#2a2418'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { const y = Math.random() * s; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * .3, y + (Math.random() - .5) * 8, s * .6, y + (Math.random() - .5) * 8, s, y); g.stroke(); } g.globalAlpha = 1; } });
  const kelpTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 256); g.fillStyle = '#6a9a4a'; g.beginPath(); g.moveTo(32, 256); for (let y = 256; y >= 0; y -= 8) { const w = (6 + Math.sin(y * .06) * 9 + Math.sin(y * .21) * 4) * (1 - y / 256 * .35) + 4; g.lineTo(32 + w, y); } for (let y = 0; y <= 256; y += 8) { const w = (6 + Math.sin(y * .06 + 1.3) * 9 + Math.sin(y * .23) * 4) * (1 - y / 256 * .35) + 4; g.lineTo(32 - w, y); } g.closePath(); g.fill(); g.strokeStyle = '#3c5a2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 0); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const grassTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); g.lineCap = 'round'; for (let i = 0; i < 12; i++) { const x0 = 30 + Math.random() * 68, hgt = 60 + Math.random() * 60, bend = (Math.random() - .5) * 50; g.strokeStyle = '#6aa07a'; g.lineWidth = 2 + Math.random() * 3; g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0 + bend * .4, 128 - hgt * .6, x0 + bend, 128 - hgt); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  D.add(sandMap, sandNrm, rockTex, rockNrm, woodTex, kelpTex, grassTex);

  // ---------- materials ----------
  const fogOpts = { fogBase: 0, fogFalloff: 0.02 };
  const sandMat = stdMat({ map: sandMap, normalMap: sandNrm, normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.95, color: 0xffffff }, { ...fogOpts, caustics: true });
  const rockMat = stdMat({ map: rockTex, normalMap: rockNrm, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92, color: 0xffffff }, { ...fogOpts, caustics: true });
  const cliffMat = stdMat({ map: rockTex, roughness: 1, color: 0x2a3440 }, fogOpts);
  const woodMat = stdMat({ map: woodTex, roughness: 0.9, color: 0xffffff }, { ...fogOpts, caustics: true });
  const ironMat = stdMat({ color: 0x3a3630, metalness: 0.6, roughness: 0.7 }, fogOpts);
  const coralMat = stdMat({ roughness: 0.85, color: 0xffffff, vertexColors: true }, { ...fogOpts, instanced: true, caustics: true });
  const kelpMat = stdMat({ map: kelpTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: 0xffffff }, { ...fogOpts, wind: true, instanced: true, windHeight: 6 });
  const grassMat = stdMat({ map: grassTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: 0xffffff }, { ...fogOpts, wind: true, instanced: true, windHeight: 1 });
  const bioMat = stdMat({ color: 0x0a2030, emissive: 0x30ffd8, emissiveIntensity: 1.6, roughness: 0.6 }, { ...fogOpts, instanced: true, wind: true, windHeight: 1 });
  const consoleMat = vertexEmissive(stdMat({ color: 0x8a8a86, roughness: 0.6, metalness: 0.2, vertexColors: true, emissive: 0x4fa0ff, emissiveIntensity: 3.0 }, { ...fogOpts, caustics: true })); // screen = white vertex colour
  D.add(sandMat, rockMat, cliffMat, woodMat, ironMat, coralMat, kelpMat, grassMat, bioMat, consoleMat);

  // ---------- ground + abyss cliff ring ----------
  const ground = groundDisc(GR, sandMat, lod ? 40 : 64); group.add(ground); D.add(ground.geometry);
  { const rings = [[GR - 0.4, 0], [GR + 2.5, -1.2], [GR + 6, -5], [GR + 11, -13], [GR + 18, -26], [GR + 26, -45]]; const segs = lod ? 48 : 72; const pos = [], uv = [], idx = [];
    rings.forEach(([rad, y], ri) => { for (let i = 0; i <= segs; i++) { const a = i / segs * TAU; const nz = 1 + (ri > 0 ? Math.sin(a * 7 + ri) * .05 + Math.sin(a * 13 + ri * 2) * .03 : 0); const yy = y + (ri > 0 ? Math.sin(a * 9 + ri * 3) * (0.3 + ri * .4) : 0); pos.push(Math.cos(a) * rad * nz, yy, Math.sin(a) * rad * nz); uv.push(i / segs * 24, ri * 2); } });
    for (let ri = 0; ri < rings.length - 1; ri++) for (let i = 0; i < segs; i++) { const a = ri * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const cliff = new THREE.Mesh(g, cliffMat); cliff.receiveShadow = true; group.add(cliff); D.add(g); }

  // ---------- rock spires + boulders (static) ----------
  const rockParts = []; const spires = [];
  for (let i = 0; i < (lod ? 6 : 9); i++) { const a = i / 9 * TAU + r.range(-.2, .2); const d = R + 1 + r.range(0, 6); const hgt = r.range(6, 13), w = r.range(1.4, 2.6); const g = new THREE.ConeGeometry(w, hgt, lod ? 6 : 8, 4); roughen(g, .35, 1.1, i * 3); rockParts.push(xform(g, Math.cos(a) * d, hgt * .42, Math.sin(a) * d, r() * TAU, 1, r.range(-.12, .12), r.range(-.12, .12))); spires.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: w }); camBlockers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: w * .8 }); }
  const boulders = scatter(r, lod ? 6 : 10, 4, R + 4, 4, [{ x: 0, z: 0, r: 3 }]);
  for (const b of boulders) { const s = r.range(.5, 1.4); rockParts.push(xform(rock(r, s, lod ? 0 : 1, r() * 10), b.x, -s * .1, b.z, r() * TAU, 1)); if (Math.hypot(b.x, b.z) < R) obstacles.push({ x: b.x, z: b.z, r: s * 1.05, h: s * 1.3 }); else camBlockers.push({ x: b.x, z: b.z, r: s * 1.05, h: s * 1.3 }); }
  const rocks = caster(new THREE.Mesh(merge(rockParts), rockMat), SM, tier); rocks.receiveShadow = true; group.add(rocks); D.add(rocks.geometry);

  // ---------- shipwreck hull piece + anchor + chain ----------
  const wreck = { x: Math.cos(2.3) * 21, z: Math.sin(2.3) * 21, a: 2.3 + Math.PI / 2 };
  const woodParts = [], ironParts = [];
  { const W = (g, x, y, z, ry = 0, rx = 0, rz = 0) => xform(g, wreck.x + Math.cos(wreck.a) * x + Math.sin(wreck.a) * z, y, wreck.z - Math.sin(wreck.a) * x + Math.cos(wreck.a) * z, wreck.a + ry, 1, rx, rz);
    const tilt = 0.32; const len = 15;
    // keel
    const keelPts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; keelPts.push(new THREE.Vector3(-len / 2 + t * len, -0.6 + Math.sin(t * Math.PI) * .6 + t * len * Math.tan(tilt) * .3, 0)); }
    woodParts.push(W(tube(keelPts, keelPts.map(() => .32), 6, { bump: .1 }), 0, 0, 0));
    // ribs: half-arches rising from the keel (broken at different heights)
    for (let i = 0; i <= 8; i++) { const t = i / 8; const x = -len / 2 + 1 + t * (len - 2); const rad = 3.2 * Math.sin(t * Math.PI * .85 + .25); const yb = -0.4 + t * len * Math.tan(tilt) * .3; for (const side of [-1, 1]) { const cut = r.range(.55, 1); const pts = []; const n = 5; for (let k = 0; k <= n; k++) { const u = k / n * cut; const ang = u * Math.PI * .55; pts.push(new THREE.Vector3(x, yb + Math.sin(ang) * rad * 1.3, side * (Math.cos(ang) - 1) * -rad)); } woodParts.push(W(tube(pts, pts.map((_, k) => .2 * (1 - k / n * .4)), 5), 0, 0, 0)); } }
    // planks across ribs (some missing)
    for (let p = 0; p < 7; p++) for (const side of [-1, 1]) { if (r() < .35) continue; const ang = (p + .5) / 7 * Math.PI * .5; const t0 = r.range(.05, .3), t1 = r.range(.6, .95); const x0 = -len / 2 + 1 + t0 * (len - 2), x1 = -len / 2 + 1 + t1 * (len - 2); const rad = 3.0; const y = -0.4 + Math.sin(ang) * rad * 1.3 + ((x0 + x1) / 2 + len / 2) / len * len * Math.tan(tilt) * .3; const z = side * (Math.cos(ang) - 1) * -rad; woodParts.push(W(new THREE.BoxGeometry(x1 - x0, .12, .5), (x0 + x1) / 2, y, z, 0, side * -ang, 0)); }
    obstacles.push({ x: wreck.x + Math.cos(wreck.a) * -3, z: wreck.z - Math.sin(wreck.a) * -3, r: 3.2 }, { x: wreck.x + Math.cos(wreck.a) * 3, z: wreck.z - Math.sin(wreck.a) * 3, r: 3.2 }, { x: wreck.x, z: wreck.z, r: 3.4 });
    // anchor near the arena + chain rising toward the wreck
    const ax = wreck.x * .62, az = wreck.z * .62; const aa = r() * TAU;
    const A = (g, x, y, z, ry = 0, rx = 0, rz = 0) => xform(g, ax + Math.cos(aa) * x + Math.sin(aa) * z, y, az - Math.sin(aa) * x + Math.cos(aa) * z, aa + ry, 1, rx, rz);
    ironParts.push(A(new THREE.CylinderGeometry(.09, .11, 2.6, 6), 0, .6, 0, 0, 0, 1.2)); ironParts.push(A(new THREE.TorusGeometry(.32, .07, 6, 10), 1.2, 1.2, 0, 0, 0, 0));
    ironParts.push(A(new THREE.TorusGeometry(1.1, .1, 6, 14, Math.PI).rotateZ(Math.PI), -1.1, .35, 0, 0, 0, 0)); ironParts.push(A(new THREE.ConeGeometry(.22, .5, 4).rotateZ(-Math.PI / 2), -.1, .35, 0), A(new THREE.ConeGeometry(.22, .5, 4).rotateZ(Math.PI / 2), -2.2, .35, 0));
    ironParts.push(A(new THREE.BoxGeometry(.12, .12, 1.6), 1.0, 1.1, 0));
    obstacles.push({ x: ax, z: az, r: 1.4, h: 1.7 });
    // chain
    const c0 = new THREE.Vector3(ax + Math.cos(aa) * 1.2, 1.25, az - Math.sin(aa) * 1.2), c1 = new THREE.Vector3(wreck.x - Math.cos(wreck.a) * 4, 2.6, wreck.z + Math.sin(wreck.a) * 4);
    const nl = lod ? 14 : 22; for (let i = 0; i <= nl; i++) { const t = i / nl; const p = c0.clone().lerp(c1, t); p.y -= Math.sin(t * Math.PI) * 1.4; const dir = c1.clone().sub(c0).normalize(); const ry = Math.atan2(dir.x, dir.z); ironParts.push(xform(new THREE.TorusGeometry(.22, .05, 5, 8), p.x, p.y, p.z, ry, 1, i % 2 ? Math.PI / 2 : 0, 0)); }
  }
  const wood = caster(new THREE.Mesh(merge(woodParts), woodMat), SM, tier); wood.receiveShadow = true; group.add(wood); D.add(wood.geometry);
  const iron = new THREE.Mesh(merge(ironParts), ironMat); if (!lod) caster(iron, SM, tier); iron.receiveShadow = true; group.add(iron); D.add(iron.geometry);

  // ---------- coral: 2 instanced variants with vertex + instance colour ----------
  const coralA = deadTree(seeded(77), { height: 1.4, radius: 0.13, radial: lod ? 4 : 5, branches: lod ? 4 : 6, twigs: 1, roots: 0, lean: 0.05 }); // branching coral
  { const c = coralA.attributes.color; for (let i = 0; i < c.count; i++) { const y = coralA.attributes.position.getY(i); const v = .55 + .45 * Math.min(1, y / 1.2); c.setXYZ(i, v, v * .9, v); } }
  const coralB = (() => { const parts = []; const n = lod ? 4 : 6; for (let i = 0; i < n; i++) { const a = i / n * TAU, d = r.range(.1, .35), hgt = r.range(.5, 1.3), rad = r.range(.12, .2); parts.push(withColor(new THREE.CylinderGeometry(rad * .8, rad, hgt, lod ? 5 : 7, 1, true).translate(Math.cos(a) * d, hgt / 2, Math.sin(a) * d), 0xffffff)); parts.push(withColor(new THREE.TorusGeometry(rad * .8, rad * .18, 4, lod ? 5 : 7).rotateX(Math.PI / 2).translate(Math.cos(a) * d, hgt, Math.sin(a) * d), 0xe0e0e0)); } parts.push(withColor(new THREE.SphereGeometry(.5, 7, 5).scale(1, .35, 1), 0x909090)); return merge(parts); })(); // tube sponges
  D.add(coralA, coralB);
  const nCoral = Math.max(20, Math.round(tier.trees * 0.9));
  const coralPos = scatter(r, nCoral * 2, 3.5, R + 5, 1.6, [...spires, ...boulders.map(b => ({ ...b, r: 1.5 })), { x: 0, z: 0, r: 3 }]);
  const corA = instancer(coralA, coralMat, Math.ceil(coralPos.length / 2)); if (!lod) caster(corA, SM, tier); const corB = instancer(coralB, coralMat, Math.floor(coralPos.length / 2)); corA.name = 'coralA'; corB.name = 'coralB';
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(); const palette = [0xff4a7a, 0xff8a3a, 0xb04aff, 0x2affc8, 0xffd23a, 0xff3a3a, 0x4a9aff];
    coralPos.forEach((p, i) => { const mesh = i % 2 ? corB : corA, idx = i >> 1; const s = r.range(.7, 1.6), ys = r.range(.8, 1.3); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(p.x, -.05, p.z), q, new THREE.Vector3(s, s * ys, s)); mesh.setMatrixAt(idx, m); col.set(r.pick(palette)).multiplyScalar(r.range(.6, 1)); mesh.setColorAt(idx, col); const din = Math.hypot(p.x, p.z);
      // Only the big tubes are solid -- 33 of the 69 in the arena are walk-through ON PURPOSE, because a
      // collidable coral every 1.6 m is a maze. But every one of them, up to 1.8 m tall, can hide a 1.5 m
      // Knox, so all of them go on the camera's list.
      if (din < R && s > 1.1) obstacles.push({ x: p.x, z: p.z, r: .45 * s }); else if (din < R + 8) camBlockers.push({ x: p.x, z: p.z, r: .42 * s, h: (mesh === corB ? 1.41 : 1.69) * s * ys - .1 }); });
  }
  group.add(corA, corB);

  // ---------- kelp + seagrass (instanced, swaying) ----------
  const kelpGeo = new THREE.PlaneGeometry(1.0, 6, 1, lod ? 4 : 8).translate(0, 3, 0); const kelpGeo2 = kelpGeo.clone().rotateY(Math.PI / 2); const kelpX = merge([kelpGeo, kelpGeo2]); D.add(kelpX);
  const nK = Math.max(24, Math.round(tier.grass / 12)); const kelp = instancer(kelpX, kelpMat, nK); kelp.name = 'kelp';
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < nK; i++) { const rim = r() < .85; const a = r() * TAU, d = rim ? r.range(R - 2, R + 7) : r.range(5, R - 4); const s = r.range(.5, 1.0); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(s, s * r.range(.7, 1.4), s)); kelp.setMatrixAt(i, m); const v = r.range(.5, 1); col.setRGB(v * r.range(.7, 1), v, v * r.range(.6, .9)); kelp.setColorAt(i, col); }
  }
  const grassGeo = merge([new THREE.PlaneGeometry(.8, .7).translate(0, .35, 0), new THREE.PlaneGeometry(.8, .7).rotateY(Math.PI / 2).translate(0, .35, 0)]); D.add(grassGeo);
  const nG = Math.round(tier.grass * 0.35); const grass = instancer(grassGeo, grassMat, nG); grass.name = 'seagrass';
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < nG; i++) { const a = r() * TAU, d = Math.sqrt(r()) * (R + 5); const s = r.range(.7, 1.5); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(s, s * r.range(.7, 1.3), s)); grass.setMatrixAt(i, m); const v = r.range(.5, 1); col.setRGB(v * .8, v, v * .85); grass.setColorAt(i, col); }
  }
  group.add(kelp, grass);

  // ---------- bioluminescent plants (instanced emissive) + halos ----------
  const bioGeo = (() => { const parts = []; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(new THREE.ConeGeometry(.05, r.range(.5, .9), 4).translate(Math.cos(a) * .12, .3, Math.sin(a) * .12).rotateY(a)); parts.push(new THREE.SphereGeometry(.07, 5, 4).translate(Math.cos(a) * .12, .68, Math.sin(a) * .12)); } return merge(parts); })(); D.add(bioGeo);
  const nB = lod ? 14 : 26; const bio = instancer(bioGeo, bioMat, nB); bio.name = 'bio';
  const bioPos = scatter(r, nB, 3, R + 4, 3, [...spires, { x: 0, z: 0, r: 3 }]);
  const halos = new Glows(Math.min(14, bioPos.length) + 1, { fogDensity: 0.05, renderOrder: 16 }); group.add(halos.mesh);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(); const c1 = new THREE.Color(0x30ffd8), c2 = new THREE.Color(0xff4ad0);
    bioPos.forEach((p, i) => { const s = r.range(.8, 1.6); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU); m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(s, s, s)); bio.setMatrixAt(i, m); if (i < 14) { const c = r() < .75 ? c1 : c2; halos.set(i, p.x, .7 * s, p.z, c.r, c.g, c.b, 1.6 * s, .4); p.h = i; } });
    for (let i = bioPos.length; i < nB; i++) { m.makeScale(0, 0, 0); bio.setMatrixAt(i, m); }
  }
  group.add(bio);

  // ---------- the console (Mario easter egg): half-buried, screen glowing ----------
  const secret = { x: 6.5, y: 0.35, z: -10.5 };
  const consoleBody = withColor(merge([new THREE.BoxGeometry(1.1, .5, .9), new THREE.BoxGeometry(.5, .08, .3).translate(0, .29, -.2), new THREE.CylinderGeometry(.06, .06, .16, 8).translate(.3, .29, .2), new THREE.BoxGeometry(.9, .12, .7).translate(.7, -.05, .5).rotateY(.4)]), 0x000000);
  const screenGeo = withColor(new THREE.BoxGeometry(.42, .3, .04).translate(0, .12, .46), 0xffffff);
  const consoleMesh = new THREE.Mesh(merge([consoleBody, screenGeo]), consoleMat);
  consoleMesh.position.set(secret.x, secret.y - .22, secret.z); consoleMesh.rotation.set(0.1, 0.7, 0.18); caster(consoleMesh, SM, tier); consoleMesh.receiveShadow = true; group.add(consoleMesh); D.add(consoleMesh.geometry);
  halos.set(halos.n - 1, secret.x, secret.y + .1, secret.z, 0.3, 0.6, 1.0, 1.4, .5);
  obstacles.push({ x: secret.x, z: secret.z, r: .8, h: .75 });

  // ---------- god rays ----------
  const rayGeo = new THREE.CylinderGeometry(1.0, 3.2, 14, lod ? 10 : 14, 1, true).translate(0, 7, 0); D.add(rayGeo);
  const rays = []; const rayMats = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .4; const d = r.range(6, 15); const m = new THREE.ShaderMaterial({ vertexShader: RAY_VS, fragmentShader: RAY_FS, uniforms: { uColor: { value: new THREE.Color(0x4fb7ff) }, uAlpha: { value: 0.7 }, uTime: { value: 0 }, uSeed: { value: i * 2.7 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }); rayMats.push(m); D.add(m);
    const mesh = new THREE.Mesh(rayGeo, m); mesh.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); mesh.rotation.set(-0.12, 0, -0.1 + r.range(-.05, .05)); mesh.renderOrder = 12; mesh.frustumCulled = false; rays.push(mesh); group.add(mesh); }

  // ---------- water surface seen from below ----------
  const waterMat = new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x0e4f7c) }, uSunColor: { value: new THREE.Color(0xbfefff) }, uSunDir: { value: new THREE.Vector3(0.12, 0.96, 0.2).normalize() }, uFogColor: { value: new THREE.Color(THEME.rig.fog[0]) }, uFogDensity: { value: THEME.rig.fog[1] } }, depthWrite: false, side: THREE.FrontSide, fog: false }); D.add(waterMat);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 1, 1).rotateX(Math.PI / 2), waterMat); water.position.y = 14; water.renderOrder = 3; water.frustumCulled = false; group.add(water); D.add(water.geometry);

  // ---------- spawn points ----------
  const spawnPoints = [0.9, 2.5, 4.0, 5.6].map(a => ({ x: Math.cos(a) * (R - 1.5), y: 2 + r.range(0, 2), z: Math.sin(a) * (R - 1.5), kind: 'water' }));
  const bossSpawn = { x: 0, y: 3.5, z: -R + 2 };

  // ---------- state ----------
  const prevWind = FOG.wind.value, prevCaustic = FOG.caustic.value, prevCausticCol = FOG.causticColor.value.clone();
  FOG.wind.value = 1.3; FOG.caustic.value = 0.45; FOG.causticColor.value.set(0x7fd8ff);
  const fogBase = new THREE.Color(THEME.rig.fog[0]), fogBlack = new THREE.Color(0x2a0308); const cBase = new THREE.Color(0x7fd8ff), cBlack = new THREE.Color(0xff3a2a);
  const waterBase = new THREE.Color(0x0e4f7c), waterBlack = new THREE.Color(0x4a0810); const zenBase = new THREE.Color(THEME.sky.zenith), zenBlack = new THREE.Color(0x4a0a10), horBase = new THREE.Color(THEME.sky.horizon), horBlack = new THREE.Color(0x1a0204);
  let bw = 0, bubbleAcc = 0, siltAcc = 0; const cBub = new THREE.Color(0x9fdcff), cSilt = new THREE.Color(0x5a6a70), cRed = new THREE.Color(0x6a1a12);

  function update(dt, t, playerPos) {
    for (const m of rayMats) m.uniforms.uTime.value = t; waterMat.uniforms.uTime.value = t;
    // slow god-ray sway
    rays.forEach((m, i) => { m.rotation.z = -0.1 + Math.sin(t * .11 + i) * .05; m.rotation.x = -0.12 + Math.cos(t * .09 + i * 1.7) * .04; });
    // bio pulse
    for (let i = 0; i < Math.min(14, bioPos.length); i++) halos.alpha(i, .3 + .15 * Math.sin(t * 1.3 + i * 1.9));
    halos.alpha(halos.n - 1, .35 + .2 * Math.sin(t * 4.));
    if (ctx.particlesAdd) { bubbleAcc += dt * 9; while (bubbleAcc > 1) { bubbleAcc -= 1; const a = r() * TAU, d = Math.sqrt(r()) * (R + 3); ctx.particlesAdd.one(Math.cos(a) * d, r.range(0, .6), Math.sin(a) * d, { type: P.BUBBLE, color: cBub, life: r.range(4, 8), size: r.range(.04, .12), sizeEnd: r.range(.08, .16), vx: r.range(-.1, .1), vy: r.range(.5, 1.1), vz: r.range(-.1, .1), fadeIn: .3, spin: r.range(-1, 1) }); } }
    if (ctx.particlesAlpha) { siltAcc += dt * 14; while (siltAcc > 1) { siltAcc -= 1; const a = r() * TAU, d = Math.sqrt(r()) * 14; ctx.particlesAlpha.one(playerPos.x + Math.cos(a) * d, r.range(.2, 5), playerPos.z + Math.sin(a) * d, { type: P.DOT, color: bw > .5 ? cRed : cSilt, life: r.range(5, 9), size: r.range(.02, .05), vx: r.range(-.12, .12), vy: r.range(-.04, .08), vz: r.range(-.12, .12), fadeIn: .4 }); } }
  }
  function blackwater(v) {
    bw = Math.max(0, Math.min(1, v));
    if (ctx.scene.fog) { ctx.scene.fog.color.copy(fogBase).lerp(fogBlack, bw); ctx.scene.fog.density = THEME.rig.fog[1] + 0.07 * bw; }
    FOG.causticColor.value.copy(cBase).lerp(cBlack, bw); waterMat.uniforms.uColor.value.copy(waterBase).lerp(waterBlack, bw); waterMat.uniforms.uFogColor.value.copy(ctx.scene.fog ? ctx.scene.fog.color : fogBase); waterMat.uniforms.uFogDensity.value = THEME.rig.fog[1] + 0.07 * bw;
    for (const m of rayMats) m.uniforms.uColor.value.set(0x4fb7ff).lerp(new THREE.Color(0xff3a2a), bw);
    if (ctx.sky) { ctx.sky.uniforms.zenith.value.copy(zenBase).lerp(zenBlack, bw); ctx.sky.uniforms.horizon.value.copy(horBase).lerp(horBlack, bw); }
    if (ctx.lighting) { ctx.lighting.key.color.set(THEME.rig.key[0]).lerp(new THREE.Color(0xff5040), bw); ctx.lighting.hemi.color.set(THEME.rig.hemi[0]).lerp(new THREE.Color(0x5a1410), bw); }
  }
  function dispose() {
    FOG.wind.value = prevWind; FOG.caustic.value = prevCaustic; FOG.causticColor.value.copy(prevCausticCol);
    if (bw > 0) blackwater(0);
    halos.dispose(); D.dispose(); group.removeFromParent();
  }

  return { group, update, dispose, spawnPoints, bossSpawn, obstacles, camBlockers: obstacles.concat(camBlockers), lampsOff() { }, blackout() { }, blackwater, lightning() { }, eyes() { }, trophies() { }, secretPos: secret };
}
