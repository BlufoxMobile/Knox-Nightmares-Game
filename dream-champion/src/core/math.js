export const PI = Math.PI, TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const rndi = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const ease = { out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, inout: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, outBack: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2) };
export function angLerp(a, b, t) { let d = ((b - a + PI) % TAU + TAU) % TAU - PI; return a + d * t; }
export function angDiff(a, b) { return ((b - a + PI) % TAU + TAU) % TAU - PI; }
export function dampAng(a, b, lambda, dt) { return angLerp(a, b, 1 - Math.exp(-lambda * dt)); }
// deterministic hash noise
export function hash(n) { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }
// segment (p->q) vs circle (c, r) in XZ: returns true if intersects
export function segCircleXZ(px, pz, qx, qz, cx, cz, r) {
  const dx = qx - px, dz = qz - pz, fx = px - cx, fz = pz - cz;
  const a = dx * dx + dz * dz; if (a < 1e-8) return fx * fx + fz * fz <= r * r;
  let t = -(fx * dx + fz * dz) / a; t = clamp(t, 0, 1);
  const ex = fx + dx * t, ez = fz + dz * t; return ex * ex + ez * ez <= r * r;
}
// critically-damped spring step (value, velocity) toward target
export function springStep(s, target, omega, zeta, dt) {
  const f = 1 + 2 * dt * zeta * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo, detInv = 1 / (f + hhoo);
  const detX = f * s.v0 + dt * s.v1 + hhoo * target, detV = s.v1 + hoo * (target - s.v0);
  s.v0 = detX * detInv; s.v1 = detV * detInv; return s.v0;
}
export class Perlin1 { constructor(seed = 1) { this.seed = seed; } at(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const a = hash(i + this.seed * 7.13) * 2 - 1, b = hash(i + 1 + this.seed * 7.13) * 2 - 1; return lerp(a, b, u); } }
