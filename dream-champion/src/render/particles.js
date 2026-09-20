// GPU particle ring buffer: one InstancedBufferGeometry per blend mode, all motion integrated in the vertex shader.
import * as THREE from 'three';
import { rnd } from '../core/math.js';

const VS = `
attribute vec4 a0; // spawn, life, seed, type
attribute vec4 a1; // pos, size
attribute vec4 a2; // vel, gravity
attribute vec4 a3; // color, spin
attribute vec4 a4; // sizeEnd, drag, fadeIn, stretch
uniform float time; uniform float soft;
varying vec2 vUv; varying vec4 vCol; varying float vType;
void main(){
  float t = time - a0.x; float life = a0.y; float u = clamp(t / max(life, .0001), 0., 1.);
  float alive = step(0., t) * step(t, life);
  float drag = a4.y; float k = (drag > 0.) ? (1. - exp(-drag * t)) / drag : t;
  vec3 p = a1.xyz + a2.xyz * k + vec3(0., -.5 * a2.w * t * t, 0.);
  float size = mix(a1.w, a4.x, u) * alive;
  float ang = a3.w * t + a0.z * 6.283;
  vec2 q = position.xy; float c = cos(ang), s = sin(ang); q = vec2(q.x*c - q.y*s, q.x*s + q.y*c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // stretch along velocity for streaks
  if (a4.w > 0.) { vec3 vv = (viewMatrix * vec4(a2.xyz, 0.)).xyz; vec2 d = normalize(vv.xy + vec2(1e-4)); float l = 1. + a4.w * length(vv) * .1; q = vec2(dot(q, d) * l, dot(q, vec2(-d.y, d.x))); q = d * q.x + vec2(-d.y, d.x) * q.y; }
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
  float fade = smoothstep(0., a4.z, u) * (1. - smoothstep(.6, 1., u));
  vCol = vec4(a3.rgb, fade * alive); vUv = uv; vType = a0.w;
}`;
const FS = `
uniform sampler2D atlas; varying vec2 vUv; varying vec4 vCol; varying float vType;
void main(){
  float ty = floor(vType); vec2 cell = vec2(mod(ty, 4.), floor(ty / 4.)); vec2 uv = (vUv + cell) * .25;
  vec4 t = texture2D(atlas, uv); vec4 c = vec4(vCol.rgb * t.rgb, t.a * vCol.a); if (c.a < .01) discard; gl_FragColor = c;
}`;

export const P = { DOT: 0, SPARK: 1, SMOKE: 2, DROP: 3, BUBBLE: 4, ASH: 5, STREAK: 6, EMBER: 7, RING: 8, CHUNK: 9, FEATHER: 10, LEAF: 11, SKULL: 12, BOLT: 13, DISC: 14, STAR: 15 };

function makeAtlas() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const cs = S / 4;
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * cs, Math.floor(i / 4) * cs); g.beginPath(); g.rect(0, 0, cs, cs); g.clip(); fn(cs); g.restore(); };
  const rad = (s, stops) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); stops.forEach(([o, col]) => r.addColorStop(o, col)); g.fillStyle = r; g.fillRect(0, 0, s, s); };
  cell(P.DOT, s => rad(s, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]));
  cell(P.SPARK, s => rad(s, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]));
  cell(P.SMOKE, s => { for (let i = 0; i < 26; i++) { const x = s / 2 + (Math.random() - .5) * s * .5, y = s / 2 + (Math.random() - .5) * s * .5, r = s * (0.12 + Math.random() * 0.2); const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, s, s); } });
  cell(P.DROP, s => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(s / 2, s / 2, s * .28, s * .38, 0, 0, Math.PI * 2); g.fill(); rad(s, [[0, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]); });
  cell(P.BUBBLE, s => { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = s * .05; g.beginPath(); g.arc(s / 2, s / 2, s * .4, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill(); g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(s * .36, s * .36, s * .07, s * .04, -0.7, 0, Math.PI * 2); g.fill(); });
  cell(P.ASH, s => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s * .3, s * .4); g.lineTo(s * .55, s * .25); g.lineTo(s * .7, s * .5); g.lineTo(s * .5, s * .75); g.lineTo(s * .32, s * .6); g.closePath(); g.fill(); });
  cell(P.STREAK, s => { const lg = g.createLinearGradient(0, s / 2, s, s / 2); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.beginPath(); g.ellipse(s / 2, s / 2, s * .48, s * .1, 0, 0, Math.PI * 2); g.fill(); });
  cell(P.EMBER, s => rad(s, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,.9)'], [0.5, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]));
  cell(P.RING, s => { g.strokeStyle = '#fff'; g.lineWidth = s * .08; g.beginPath(); g.arc(s / 2, s / 2, s * .42, 0, Math.PI * 2); g.stroke(); });
  cell(P.CHUNK, s => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s * .25, s * .35); g.lineTo(s * .5, s * .2); g.lineTo(s * .78, s * .45); g.lineTo(s * .62, s * .8); g.lineTo(s * .3, s * .7); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(s * .55, s * .5, s * .12, 0, 7); g.fill(); });
  cell(P.FEATHER, s => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(s / 2, s / 2, s * .12, s * .42, 0.4, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(s * .35, s * .85); g.lineTo(s * .65, s * .15); g.stroke(); });
  cell(P.LEAF, s => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s * .5, s * .1); g.quadraticCurveTo(s * .9, s * .5, s * .5, s * .9); g.quadraticCurveTo(s * .1, s * .5, s * .5, s * .1); g.fill(); });
  cell(P.SKULL, s => { g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, s * .42, s * .3, 0, 7); g.fill(); g.fillRect(s * .32, s * .55, s * .36, s * .25); g.fillStyle = '#000'; g.beginPath(); g.arc(s * .4, s * .42, s * .08, 0, 7); g.arc(s * .6, s * .42, s * .08, 0, 7); g.fill(); g.fillRect(s * .44, s * .62, s * .04, s * .12); g.fillRect(s * .52, s * .62, s * .04, s * .12); });
  cell(P.BOLT, s => { const lg = g.createLinearGradient(0, 0, s, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.3, 'rgba(255,255,255,1)'); lg.addColorStop(.7, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.beginPath(); g.ellipse(s / 2, s / 2, s * .48, s * .16, 0, 0, Math.PI * 2); g.fill(); rad(s, [[0, 'rgba(255,255,255,.9)'], [.25, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]); });
  cell(P.DISC, s => { g.strokeStyle = '#fff'; g.lineWidth = s * .12; g.beginPath(); g.arc(s / 2, s / 2, s * .34, 0, Math.PI * 2); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * .38, s / 2 + Math.sin(a) * s * .38); g.lineTo(s / 2 + Math.cos(a + .3) * s * .48, s / 2 + Math.sin(a + .3) * s * .48); g.lineWidth = s * .05; g.stroke(); } rad(s, [[0, 'rgba(255,255,255,.8)'], [.35, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]); });
  cell(P.STAR, s => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * .18 : s * .45; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); } g.closePath(); g.fill(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; return tex;
}
let ATLAS = null;

export class Particles {
  constructor(scene, cap = 1024, additive = true) {
    this.cap = cap; this.head = 0; this.time = 0;
    ATLAS = ATLAS || makeAtlas();
    const geo = new THREE.InstancedBufferGeometry(); geo.copy(new THREE.PlaneGeometry(1, 1)); geo.instanceCount = cap;
    this.a0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.a2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.a3 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.a4 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.a0, this.a1, this.a2, this.a3, this.a4]) a.setUsage(THREE.DynamicDrawUsage);
    this.a0.array.fill(-1e6); // spawn far in the past -> dead
    geo.setAttribute('a0', this.a0); geo.setAttribute('a1', this.a1); geo.setAttribute('a2', this.a2); geo.setAttribute('a3', this.a3); geo.setAttribute('a4', this.a4);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { time: { value: 0 }, atlas: { value: ATLAS }, soft: { value: 1 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 20 : 19; scene.add(this.mesh);
    this.dirty = false; this.minI = cap; this.maxI = -1;
  }
  update(dt) { this.time += dt; this.mat.uniforms.time.value = this.time; if (this.dirty) { for (const a of [this.a0, this.a1, this.a2, this.a3, this.a4]) { a.clearUpdateRanges(); a.addUpdateRange(this.minI * 4, (this.maxI - this.minI + 1) * 4); a.needsUpdate = true; } this.dirty = false; this.minI = this.cap; this.maxI = -1; } }
  clear() { this.a0.array.fill(-1e6); this.a0.needsUpdate = true; }
  // emit one particle
  one(x, y, z, o) {
    const i = this.head; this.head = (this.head + 1) % this.cap; const k = i * 4;
    const life = o.life ?? 1, size = o.size ?? 0.2;
    this.a0.array[k] = this.time + (o.delay || 0); this.a0.array[k + 1] = life; this.a0.array[k + 2] = Math.random(); this.a0.array[k + 3] = o.type ?? P.DOT;
    this.a1.array[k] = x; this.a1.array[k + 1] = y; this.a1.array[k + 2] = z; this.a1.array[k + 3] = size;
    this.a2.array[k] = o.vx || 0; this.a2.array[k + 1] = o.vy || 0; this.a2.array[k + 2] = o.vz || 0; this.a2.array[k + 3] = o.gravity ?? 0;
    const c = o.color; this.a3.array[k] = c.r; this.a3.array[k + 1] = c.g; this.a3.array[k + 2] = c.b; this.a3.array[k + 3] = o.spin ?? 0;
    this.a4.array[k] = o.sizeEnd ?? size; this.a4.array[k + 1] = o.drag ?? 0; this.a4.array[k + 2] = o.fadeIn ?? 0.05; this.a4.array[k + 3] = o.stretch ?? 0;
    if (i < this.minI) this.minI = i; if (i > this.maxI) this.maxI = i; this.dirty = true;
  }
  // burst: n particles in a cone/sphere. o: {type,color,color2,n,speed,spread(0..1 sphere),dir(vec3),life,lifeVar,size,sizeEnd,gravity,drag,spin,stretch,delaySpread}
  burst(x, y, z, o) {
    const n = o.n ?? 12; const dir = o.dir; const spread = o.spread ?? 1; const c = o.color, c2 = o.color2; const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let dx = rnd(-1, 1), dy = rnd(-1, 1), dz = rnd(-1, 1); const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      if (dir) { dx = dir.x + dx * spread; dy = dir.y + dy * spread; dz = dir.z + dz * spread; const l2 = Math.hypot(dx, dy, dz) || 1; dx /= l2; dy /= l2; dz /= l2; }
      const sp = (o.speed ?? 3) * rnd(0.4, 1.1); if (c2) col.copy(c).lerp(c2, Math.random()); else col.copy(c);
      this.one(x + rnd(-1, 1) * (o.jitter || 0), y + rnd(-1, 1) * (o.jitter || 0), z + rnd(-1, 1) * (o.jitter || 0), { type: o.type, color: col, vx: dx * sp, vy: dy * sp + (o.up || 0), vz: dz * sp, life: (o.life ?? 0.8) * rnd(1 - (o.lifeVar ?? 0.4), 1 + (o.lifeVar ?? 0.4)), size: (o.size ?? 0.15) * rnd(0.7, 1.3), sizeEnd: o.sizeEnd, gravity: o.gravity, drag: o.drag, spin: o.spin !== undefined ? rnd(-o.spin, o.spin) : rnd(-3, 3), stretch: o.stretch, fadeIn: o.fadeIn, delay: o.delaySpread ? rnd(0, o.delaySpread) : 0 });
    }
  }
}
