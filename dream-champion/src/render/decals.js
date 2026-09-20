// Ground decals (blood splats, scorch, telegraph fills) as one instanced quad ring buffer on the flat arena floor.
import * as THREE from 'three';
import { rnd } from '../core/math.js';

const VS = `
attribute vec4 a0; // birth, life, atlasIndex, rot
attribute vec4 a1; // x, z, size, fadeIn
attribute vec4 a2; // color rgb, alpha
uniform float time; varying vec2 vUv; varying vec4 vCol; varying float vIdx; varying float vU; varying float vTele;
void main(){
  float t = time - a0.x; float u = clamp(t / a0.y, 0., 1.); float alive = step(0., t) * step(t, a0.y);
  float c = cos(a0.w), s = sin(a0.w); vec2 q = vec2(position.x*c - position.z*s, position.x*s + position.z*c) * a1.z * alive;
  vec3 p = vec3(a1.x + q.x, .012, a1.y + q.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  float tele = step(a1.w, -1e-5); float fadeIn = abs(a1.w);
  float fade = smoothstep(0., fadeIn, u) * mix(1. - smoothstep(.75, 1., u), 1. + .9 * smoothstep(.85, 1., u), tele);
  vCol = vec4(a2.rgb, a2.a * fade); vUv = uv; vIdx = a0.z; vU = u; vTele = tele;
}`;
const FS = `
uniform sampler2D atlas; varying vec2 vUv; varying vec4 vCol; varying float vIdx; varying float vU; varying float vTele;
void main(){
  float i = floor(vIdx); vec2 cell = vec2(mod(i, 4.), floor(i/4.)); vec4 t = texture2D(atlas, (vUv + cell) * .25);
  float a = t.a * vCol.a;
  if (vTele > .5) { // telegraph: the danger fills up so 'dodge NOW' has a visible clock
    float radial = length(vUv - .5) * 2.;
    float fillCoord = i > 7.5 ? (1. - vUv.y) : radial;   // LINE fills origin->tip, cone/disc/ring fill outward
    a *= mix(.34, 1., step(fillCoord, vU));
  }
  vec4 c = vec4(vCol.rgb, a); if (c.a < .02) discard; gl_FragColor = c; }`;

export const D = { SPLAT0: 0, SPLAT1: 1, SPLAT2: 2, SPLAT3: 3, SCORCH: 4, RING: 5, DISC: 6, CONE: 7, LINE: 8, CRACK: 9, PUDDLE: 10, BONES: 11 };

function makeAtlas() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const cs = S / 4;
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * cs, Math.floor(i / 4) * cs); g.beginPath(); g.rect(0, 0, cs, cs); g.clip(); fn(cs); g.restore(); };
  const splat = (s, seed) => { let r = seed; const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; }; g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, s / 2, s * .16, 0, 7); g.fill(); for (let i = 0; i < 40; i++) { const a = R() * 7, d = R() * s * .42, rr = s * (0.02 + R() * .07) * (1 - d / s); g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, rr, 0, 7); g.fill(); if (R() < .5) { g.beginPath(); g.ellipse(s / 2 + Math.cos(a) * d * .6, s / 2 + Math.sin(a) * d * .6, rr * 1.4, rr * .5, a, 0, 7); g.fill(); } } };
  cell(D.SPLAT0, s => splat(s, 11)); cell(D.SPLAT1, s => splat(s, 27)); cell(D.SPLAT2, s => splat(s, 63)); cell(D.SPLAT3, s => splat(s, 91));
  cell(D.SCORCH, s => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.5, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
  cell(D.RING, s => { g.strokeStyle = '#fff'; g.lineWidth = s * .06; g.beginPath(); g.arc(s / 2, s / 2, s * .44, 0, 7); g.stroke(); });
  cell(D.DISC, s => { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(s / 2, s / 2, s * .46, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = s * .04; g.stroke(); });
  cell(D.CONE, s => { g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(s / 2, s / 2); g.arc(s / 2, s / 2, s * .48, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = s * .035; g.stroke(); });
  cell(D.LINE, s => { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(s * .38, 0, s * .24, s); g.strokeStyle = '#fff'; g.lineWidth = s * .03; g.strokeRect(s * .38, s * .01, s * .24, s * .98); });
  cell(D.CRACK, s => { g.strokeStyle = '#fff'; g.lineWidth = s * .02; for (let i = 0; i < 14; i++) { const a = i / 14 * 7 + Math.sin(i) * .4; g.beginPath(); g.moveTo(s / 2, s / 2); let x = s / 2, y = s / 2; for (let k = 0; k < 5; k++) { x += Math.cos(a + Math.sin(k * 3 + i) * .5) * s * .09; y += Math.sin(a + Math.cos(k * 2 + i) * .5) * s * .09; g.lineTo(x, y); } g.stroke(); } });
  cell(D.PUDDLE, s => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * .45); r.addColorStop(0, 'rgba(255,255,255,.85)'); r.addColorStop(.7, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * 7, rr = s * (.38 + Math.sin(i * 2.3) * .06); g.lineTo(s / 2 + Math.cos(a) * rr, s / 2 + Math.sin(a) * rr); } g.fill(); });
  cell(D.BONES, s => { g.strokeStyle = '#fff'; g.lineWidth = s * .05; g.lineCap = 'round'; for (let i = 0; i < 7; i++) { const a = i * 1.1, x = s / 2 + Math.cos(a) * s * .18, y = s / 2 + Math.sin(a) * s * .18; g.beginPath(); g.moveTo(x - Math.cos(a + 1) * s * .14, y - Math.sin(a + 1) * s * .14); g.lineTo(x + Math.cos(a + 1) * s * .14, y + Math.sin(a + 1) * s * .14); g.stroke(); } g.fillStyle = '#fff'; g.beginPath(); g.arc(s * .55, s * .45, s * .09, 0, 7); g.fill(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
let ATLAS = null;

export class Decals {
  constructor(scene, cap = 128) {
    ATLAS = ATLAS || makeAtlas(); this.cap = cap; this.head = 0; this.time = 0;
    const geo = new THREE.InstancedBufferGeometry(); geo.copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)); geo.instanceCount = cap;
    this.a0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.a2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.a0.array.fill(-1e6); for (const a of [this.a0, this.a1, this.a2]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('a0', this.a0); geo.setAttribute('a1', this.a1); geo.setAttribute('a2', this.a2);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { time: { value: 0 }, atlas: { value: ATLAS } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh); this.dirty = false;
  }
  update(dt) { this.time += dt; this.mat.uniforms.time.value = this.time; if (this.dirty) { this.a0.needsUpdate = this.a1.needsUpdate = this.a2.needsUpdate = true; this.dirty = false; } }
  clear() { this.a0.array.fill(-1e6); this.dirty = true; }
  // returns slot index so telegraphs can be updated/removed
  add(x, z, o) {
    const i = this.head; this.head = (this.head + 1) % this.cap; this.set(i, x, z, o); return i;
  }
  set(i, x, z, o) {
    const k = i * 4; this.a0.array[k] = this.time + (o.delay || 0); this.a0.array[k + 1] = o.life ?? 20; this.a0.array[k + 2] = o.type ?? D.SPLAT0; this.a0.array[k + 3] = o.rot ?? rnd(0, 6.28);
    this.a1.array[k] = x; this.a1.array[k + 1] = z; this.a1.array[k + 2] = o.size ?? 1.5;
    // negative fadeIn flags a telegraph: the shader fills it toward impact instead of fading it out
    const tele = o.tele ?? (o.type === D.CONE || o.type === D.LINE || o.type === D.RING);
    this.a1.array[k + 3] = (o.fadeIn ?? 0.02) * (tele ? -1 : 1);
    const c = o.color; this.a2.array[k] = c.r; this.a2.array[k + 1] = c.g; this.a2.array[k + 2] = c.b; this.a2.array[k + 3] = o.alpha ?? 0.9; this.dirty = true;
  }
  move(i, x, z, rot) { const k = i * 4; this.a1.array[k] = x; this.a1.array[k + 1] = z; if (rot !== undefined) this.a0.array[k + 3] = rot; this.dirty = true; }
  kill(i) { this.a0.array[i * 4] = -1e6; this.dirty = true; }
  splat(x, z, color, size = 1.4) { this.add(x + rnd(-.3, .3), z + rnd(-.3, .3), { type: (Math.random() * 4) | 0, size: size * rnd(0.7, 1.3), color, life: 40, alpha: 0.85 }); }
}
