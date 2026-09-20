// Shared procedural builders for the world modules: seeded rng, tube/tree/rock generators, merged statics,
// ground disc, ground-fog sheets, billboard glow quads, texture recipes and a disposer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchFog, instancer, noiseTexture, normalFromNoise, radialAlphaTexture } from '../../render/fx.js';

export const TAU = Math.PI * 2;
// direction as an array that also answers to .x/.y/.z (Sky.apply copies Vector3-like objects, Lighting reads arrays)
export function dir3(x, y, z) { return Object.assign([x, y, z], { x, y, z }); }

// deterministic rng so a world looks the same every visit
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(r.range(a, b + 1));
  r.pick = (arr) => arr[(r() * arr.length) | 0];
  r.sign = () => r() < .5 ? -1 : 1;
  return r;
}

// tracks everything that needs dispose()
export class Disposer {
  constructor() { this.items = new Set(); }
  add(...xs) { for (const x of xs) if (x) this.items.add(x); return xs[0]; }
  // collect geometries/materials/textures reachable from an Object3D
  walk(root) {
    root.traverse(o => {
      if (o.geometry) this.items.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) { this.items.add(m); for (const k of ['map', 'normalMap', 'alphaMap', 'emissiveMap', 'roughnessMap']) if (m[k]) this.items.add(m[k]); }
    });
  }
  dispose() { for (const x of this.items) { try { x.dispose && x.dispose(); } catch (_) { } } this.items.clear(); }
}

// ---------- materials ----------
// Per-world shadow depth materials. three's shared MeshDepthMaterial keeps the last caster's `map` in its uniform cache
// (refreshUniformsCommon only overwrites map when truthy), which re-uploads disposed textures after a world switch.
// Giving casters their own depth materials (disposed with the world) avoids that and skips the texture fetch in the depth pass.
export function shadowMats(D) {
  const s = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); const i = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  D.add(s, i); return { s, i };
}
export function caster(mesh, sm, tier) { if (tier && tier.shadowCasters !== 'all') return mesh; mesh.castShadow = true; mesh.customDepthMaterial = mesh.isInstancedMesh ? sm.i : sm.s; return mesh; }
export function stdMat(o = {}, fog = {}) {
  const m = new THREE.MeshStandardMaterial(o);
  return patchFog(m, fog);
}
// emissive gated by the vertex colour (material must have vertexColors: true) and diffuse left untouched:
// lets lit and unlit parts (lamp glass + iron posts, console + screen) share one merged mesh
export function vertexEmissive(mat) {
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh) => { prev && prev(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;'); };
  mat.customProgramCacheKey = () => (pk ? pk() : '') + 'vem'; return mat;
}

// ---------- geometry helpers ----------
export function xform(geo, x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0) {
  const g = geo.clone(); const m = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, typeof s === 'number' ? new THREE.Vector3(s, s, s) : s); g.applyMatrix4(m); return g;
}
// merge with consistent attributes (drops tangents/colors unless all have them)
export function merge(geos) {
  const keep = ['position', 'normal', 'uv'];
  const hasColor = geos.every(g => g.attributes.color);
  if (hasColor) keep.push('color');
  for (const g of geos) { for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
  const allIndexed = geos.every(g => g.index);
  const src = allIndexed ? geos : geos.map(g => g.index ? g.toNonIndexed() : g);
  const out = mergeGeometries(src, false);
  for (const g of geos) g.dispose(); if (!allIndexed) for (const g of src) g.dispose();
  return out;
}
export function withColor(geo, color) {
  const c = new THREE.Color(color); const n = geo.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
// noise-displace vertices along normals
export function roughen(geo, amt, freq = 1.5, seed = 0) {
  const p = geo.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + seed) * Math.cos(v.y * freq * 1.3 + seed * 2) + Math.sin(v.z * freq * 0.8 + v.x * 2.1 + seed * 3) * 0.6 + Math.sin((v.x + v.y + v.z) * freq * 3.1) * 0.25;
    const l = v.length() || 1; v.multiplyScalar(1 + n * amt / l);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

// tube along a polyline of points with per-point radius (parallel-transport frames)
export function tube(pts, radii, radial = 6, opts = {}) {
  const pos = [], uv = [], idx = []; let vlen = 0; const t = new THREE.Vector3(), n = new THREE.Vector3(1, 0, 0), b = new THREE.Vector3();
  const bump = opts.bump || 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i < pts.length - 1) t.subVectors(pts[i + 1], p).normalize(); else t.subVectors(p, pts[i - 1]).normalize();
    if (i === 0) { n.set(0, 1, 0); if (Math.abs(t.dot(n)) > .9) n.set(1, 0, 0); n.sub(t.clone().multiplyScalar(n.dot(t))).normalize(); }
    else { n.sub(t.clone().multiplyScalar(n.dot(t))); if (n.lengthSq() < 1e-6) n.set(1, 0, 0).cross(t); n.normalize(); }
    b.crossVectors(t, n).normalize();
    if (i > 0) vlen += p.distanceTo(pts[i - 1]);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU; const r = radii[i] * (1 + bump * (Math.sin(a * 3 + i * 1.7) * .5 + Math.sin(a * 7 + i * .9 + vlen) * .5));
      pos.push(p.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r, p.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r, p.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r);
      uv.push(j / radial, vlen * (opts.vScale || 0.5));
    }
  }
  const R = radial + 1;
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < radial; j++) { const a = i * R + j, bb = a + 1, c = a + R, d = c + 1; idx.push(a, c, bb, bb, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// dead, twisted tree. opts: {height, radius, radial, branches, twigs, roots, lean}
export function deadTree(r, o = {}) {
  const H = o.height ?? r.range(7, 11), R0 = o.radius ?? H * 0.055, radial = o.radial ?? 7, parts = [];
  const segs = 8; const pts = [], radii = []; let x = 0, z = 0; const lean = o.lean ?? 0.12; const lx = r.range(-1, 1) * lean, lz = r.range(-1, 1) * lean; let dx = lx, dz = lz;
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(new THREE.Vector3(x, t * H, z)); radii.push(R0 * (1 - t * 0.78) * (i === 0 ? 1.55 : 1)); dx += r.range(-.25, .25) * H / segs * .35; dz += r.range(-.25, .25) * H / segs * .35; x += dx * H / segs; z += dz * H / segs; }
  radii[radii.length - 1] = R0 * 0.08;
  parts.push(tube(pts, radii, radial, { bump: 0.18, vScale: 0.35 }));
  // roots
  const roots = o.roots ?? 4;
  for (let i = 0; i < roots; i++) { const a = i / roots * TAU + r.range(-.4, .4); const l = R0 * r.range(3, 5); const p0 = new THREE.Vector3(Math.cos(a) * R0 * .6, R0 * 1.2, Math.sin(a) * R0 * .6), p1 = new THREE.Vector3(Math.cos(a) * l * .55, R0 * .35, Math.sin(a) * l * .55), p2 = new THREE.Vector3(Math.cos(a) * l, -0.05, Math.sin(a) * l); parts.push(tube([p0, p1, p2], [R0 * .75, R0 * .45, R0 * .18], 5, { bump: .2 })); }
  // branches
  const nb = o.branches ?? r.int(4, 6);
  const branchFrom = (base, dir, len, rad, depth) => {
    const bp = [base.clone()], br = [rad]; const d = dir.clone(); const n = depth === 0 ? 4 : 3;
    for (let i = 1; i <= n; i++) { d.x += r.range(-.5, .5) * .45; d.z += r.range(-.5, .5) * .45; d.y += r.range(-.25, .55) * .35; d.normalize(); bp.push(bp[i - 1].clone().addScaledVector(d, len / n)); br.push(rad * (1 - i / n * .85)); }
    br[br.length - 1] = Math.max(0.015, rad * 0.08);
    parts.push(tube(bp, br, depth === 0 ? 5 : 4, { bump: .12, vScale: .8 }));
    if (depth < (o.twigs ?? 1)) { const k = r.int(1, 2); for (let i = 0; i < k; i++) { const at = r.int(1, n - 1); const dd = d.clone(); dd.x += r.range(-1, 1); dd.z += r.range(-1, 1); dd.y += r.range(0, 1) * .6; dd.normalize(); branchFrom(bp[at], dd, len * r.range(.4, .6), rad * .45, depth + 1); } }
  };
  for (let i = 0; i < nb; i++) {
    const t = r.range(.42, .95); const si = Math.min(segs - 1, Math.floor(t * segs)); const f = t * segs - si; const base = pts[si].clone().lerp(pts[si + 1], f); const a = i / nb * TAU + r.range(-.5, .5);
    const dir = new THREE.Vector3(Math.cos(a), r.range(.35, 1.1), Math.sin(a)).normalize(); const rad = radii[si] * r.range(.42, .6); base.addScaledVector(dir, radii[si] * .5);
    branchFrom(base, dir, H * r.range(.28, .42) * (1 - t * .35), rad, 0);
  }
  // crooked top
  const top = pts[segs].clone(); const tdir = new THREE.Vector3(r.range(-.6, .6), 1, r.range(-.6, .6)).normalize(); branchFrom(top, tdir, H * .2, radii[segs - 1] * .6, 1);
  const g = merge(parts); g.userData.height = H; g.userData.radius = R0;
  // vertex grime: darker toward the base + streaky noise so trunks never read flat
  { const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i); const base = 0.45 + 0.55 * Math.min(1, Math.max(0, y / 2.5)); const st = 0.78 + 0.22 * Math.sin(Math.atan2(z, x) * 5 + y * 1.7) * Math.cos(y * 3.3 + x); const v = base * st; c[i * 3] = v; c[i * 3 + 1] = v * 0.97; c[i * 3 + 2] = v * 0.93; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  return g;
}

// low-poly rock: noisy icosahedron, flattened underside
export function rock(r, size = 1, detail = 1, seed = 0) {
  const g = new THREE.IcosahedronGeometry(size, detail); const p = g.attributes.position; const v = new THREE.Vector3();
  const sx = r.range(.7, 1.3), sy = r.range(.5, .9), sz = r.range(.7, 1.3);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const nz = Math.sin(v.x * 2.3 + seed) * Math.cos(v.z * 1.9 + seed) * .5 + Math.sin(v.y * 3.1 + v.x * 1.4 + seed) * .3 + Math.sin((v.x - v.z) * 4.7 + seed) * .15; v.multiplyScalar(1 + nz * .22); v.x *= sx; v.y *= sy; v.z *= sz; if (v.y < -size * .25) v.y = -size * .25; p.setXYZ(i, v.x, v.y + size * .2, v.z); }
  g.computeVertexNormals(); return g;
}

// flat arena disc, receives shadows
export function groundDisc(radius, mat, segs = 48) {
  const g = new THREE.CircleGeometry(radius, segs); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 0; return m;
}

// scatter points in an annulus with minimum spacing and avoid circles
export function scatter(r, n, rMin, rMax, minDist, avoid = [], tries = 30) {
  const out = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < tries; k++) {
      const a = r() * TAU, d = Math.sqrt(r.range(rMin * rMin, rMax * rMax)); const x = Math.cos(a) * d, z = Math.sin(a) * d; let ok = true;
      for (const q of out) if ((q.x - x) ** 2 + (q.z - z) ** 2 < minDist * minDist) { ok = false; break; }
      if (ok) for (const q of avoid) if ((q.x - x) ** 2 + (q.z - z) ** 2 < (q.r + minDist * .5) ** 2) { ok = false; break; }
      if (ok) { out.push({ x, z, a }); break; }
    }
  }
  return out;
}

// ---------- textures ----------
export function barkTexture(size = 256, base = [26, 20, 16], range = [16, 12, 9]) {
  return noiseTexture(size, { octaves: 5, base, range, grain: 24, draw: (g, s) => { g.globalAlpha = .35; g.strokeStyle = '#1a1410'; g.lineWidth = 2; for (let i = 0; i < 60; i++) { const x = Math.random() * s; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (Math.random() - .5) * 30, s * .3, x + (Math.random() - .5) * 30, s * .7, x + (Math.random() - .5) * 20, s); g.stroke(); } g.globalAlpha = 1; } });
}
export function stoneTexture(size = 256, base = [58, 60, 58], range = [26, 26, 24]) {
  return noiseTexture(size, { octaves: 5, base, range, grain: 30, draw: (g, s) => { g.globalAlpha = .25; g.fillStyle = '#3a4a34'; for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 18, 3 + Math.random() * 10, Math.random() * 3, 0, 7); g.fill(); } g.globalAlpha = 1; } });
}
// dead grass / fern blades on transparent canvas (alpha map)
export function bladeTexture(size = 128, color = '#4a4531', kind = 'grass') {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.clearRect(0, 0, size, size);
  g.lineCap = 'round';
  if (kind === 'grass') { for (let i = 0; i < 14; i++) { const x0 = size * (.2 + Math.random() * .6), h = size * (.45 + Math.random() * .5), bend = (Math.random() - .5) * size * .5; g.strokeStyle = color; g.lineWidth = 1.5 + Math.random() * 2.5; g.beginPath(); g.moveTo(x0, size); g.quadraticCurveTo(x0 + bend * .4, size - h * .6, x0 + bend, size - h); g.stroke(); } }
  else { // fern: central stem with leaflets
    for (let f = 0; f < 3; f++) { const x0 = size * (.3 + f * .2), lean = (f - 1) * size * .25; g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, size); g.quadraticCurveTo(x0 + lean * .3, size * .5, x0 + lean, size * .12); g.stroke(); for (let i = 0; i < 9; i++) { const t = .15 + i / 9 * .8; const px = x0 + lean * (1 - t) * (1 - t) * 0 + lean * (1 - t), py = size * (.12 + t * .88); const w = (1 - Math.abs(t - .5) * 1.6) * size * .14 + 2; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py); g.lineTo(px - w, py - w * .5); g.moveTo(px, py); g.lineTo(px + w, py - w * .5); g.stroke(); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// two soft dots side by side (glowing eyes)
export function eyesTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = size; c.height = size / 2; const g = c.getContext('2d'); g.clearRect(0, 0, size, size / 2);
  for (const cx of [size * .3, size * .7]) { const r = g.createRadialGradient(cx, size / 4, 0, cx, size / 4, size * .13); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, size, size / 2); }
  const t = new THREE.CanvasTexture(c); return t;
}
export { noiseTexture, normalFromNoise, radialAlphaTexture, patchFog, instancer };

// ---------- billboard glow quads (eyes, lamp halos, bio-lights): one draw call, per-quad colour/size/alpha ----------
const GLOW_VS = `attribute vec2 aCorner; attribute vec3 aColor; attribute vec2 aSizeAlpha; varying vec2 vUv; varying vec4 vCol; varying float vFog; uniform float uFogDensity;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += aCorner * aSizeAlpha.x; gl_Position = projectionMatrix * mv; vUv = aCorner * .5 + .5; vCol = vec4(aColor, aSizeAlpha.y);
  float d = length(mv.xyz); vFog = exp(-uFogDensity * uFogDensity * d * d * .35); }`;
const GLOW_FS = `uniform sampler2D map; uniform float uGlobal; varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vCol.a * uGlobal * vFog; if (a < .004) discard; gl_FragColor = vec4(vCol.rgb * t.rgb * a, a); }`;
export class Glows {
  constructor(n, opts = {}) {
    this.n = n; const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 4 * 3), corner = new Float32Array(n * 4 * 2), col = new Float32Array(n * 4 * 3), sa = new Float32Array(n * 4 * 2), idx = [];
    for (let i = 0; i < n; i++) { const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; for (let k = 0; k < 4; k++) { corner[(i * 4 + k) * 2] = c[k][0]; corner[(i * 4 + k) * 2 + 1] = c[k][1]; } idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); }
    this.pos = new THREE.BufferAttribute(pos, 3); this.col = new THREE.BufferAttribute(col, 3); this.sa = new THREE.BufferAttribute(sa, 2);
    this.pos.setUsage(THREE.DynamicDrawUsage); this.col.setUsage(THREE.DynamicDrawUsage); this.sa.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos); geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2)); geo.setAttribute('aColor', this.col); geo.setAttribute('aSizeAlpha', this.sa); geo.setIndex(idx);
    this.tex = opts.texture || radialAlphaTexture(64, 0, 1); this.ownTex = !opts.texture;
    this.mat = new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: { map: { value: this.tex }, uGlobal: { value: 1 }, uFogDensity: { value: opts.fogDensity ?? 0.04 } }, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false, blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = opts.renderOrder ?? 15;
    geo.computeBoundingSphere = () => { geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); };
  }
  set(i, x, y, z, r, g, b, size, alpha) {
    for (let k = 0; k < 4; k++) { const v = i * 4 + k; this.pos.setXYZ(v, x, y, z); this.col.setXYZ(v, r, g, b); this.sa.setXY(v, size, alpha); }
    this.pos.needsUpdate = this.col.needsUpdate = this.sa.needsUpdate = true;
  }
  alpha(i, a) { for (let k = 0; k < 4; k++) this.sa.setY(i * 4 + k, a); this.sa.needsUpdate = true; }
  size(i, s) { for (let k = 0; k < 4; k++) this.sa.setX(i * 4 + k, s); this.sa.needsUpdate = true; }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); if (this.ownTex) this.tex.dispose(); }
}

// ---------- layered scrolling ground-fog sheets (horizontal noise planes, depth-tested, no depth write) ----------
const FOG_VS = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FOG_FS = `uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform vec2 uScroll; uniform float uRadius; uniform float uSeed; varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){ vec2 p = vW.xz * .09 + uScroll * uTime; float v = n(p) * .55 + n(p * 2.1 + 3.7 - uScroll * uTime * .6) * .3 + n(p * 4.3 + 9.1) * .15;
  float d = length(vW.xz) / uRadius; float edge = 1. - smoothstep(.55, 1., d);
  float dc = length(vW - cameraPosition); float near = smoothstep(.6, 3.5, dc);
  float vd = abs(normalize(vW - cameraPosition).y); float a = smoothstep(.3, .85, v) * uAlpha * edge * near * smoothstep(.03, .22, vd);
  gl_FragColor = vec4(uColor, a); }`;
export class FogSheets {
  constructor(radius, opts = {}) {
    this.group = new THREE.Group(); this.mats = []; this.geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 1, 1).rotateX(-Math.PI / 2);
    const ys = opts.heights || [0.35, 0.75, 1.2]; const col = new THREE.Color(opts.color || 0x1a2030);
    ys.forEach((y, i) => {
      const m = new THREE.ShaderMaterial({ vertexShader: FOG_VS, fragmentShader: FOG_FS, uniforms: { uColor: { value: col.clone() }, uTime: { value: 0 }, uAlpha: { value: (opts.alpha ?? 0.4) * (1 - i * .22) }, uScroll: { value: new THREE.Vector2(0.012 + i * .006, -0.008 + i * .004).multiplyScalar(opts.speed ?? 1) }, uRadius: { value: radius }, uSeed: { value: i * 17.3 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const mesh = new THREE.Mesh(this.geo, m); mesh.position.y = y; mesh.renderOrder = 10 + i; mesh.frustumCulled = false; this.group.add(mesh); this.mats.push(m);
    });
  }
  update(t) { for (const m of this.mats) m.uniforms.uTime.value = t; }
  setColor(c) { for (const m of this.mats) m.uniforms.uColor.value.set(c); }
  setAlpha(a) { this.mats.forEach((m, i) => m.uniforms.uAlpha.value = a * (1 - i * .22)); }
  dispose() { this.geo.dispose(); for (const m of this.mats) m.dispose(); }
}

// count triangles in a group (for budgets)
export function triCount(root) { let n = 0; root.traverse(o => { if (!o.isMesh) return; const g = o.geometry; const c = g.index ? g.index.count / 3 : g.attributes.position.count / 3; n += c * (o.isInstancedMesh ? o.count : 1); }); return Math.round(n); }
