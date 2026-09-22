// Player & enemy projectiles: pure data in the fixed step, drawn as GPU particle streaks. Swept collision (segment vs circle) — no tunnelling.
import * as THREE from 'three';
import { P } from '../render/particles.js';
import { segCircleXZ, clamp } from '../core/math.js';

const C = new THREE.Color();
export class Projectiles {
  constructor(ctx) { this.ctx = ctx; this.list = []; this.pool = []; this.eshots = []; this.epool = []; }
  clear() { this.list.length = 0; this.eshots.length = 0; }
  fire(o) {
    const p = this.pool.pop() || {}; Object.assign(p, { x: o.x, y: o.y, z: o.z, px: o.x, py: o.y, pz: o.z, vx: o.dx * o.speed, vy: o.dy * o.speed, vz: o.dz * o.speed, speed: o.speed, life: o.life, dmg: o.dmg, head: o.head, style: o.style, color: o.color, aoe: o.aoe || 0, homing: o.homing || 0, target: o.target || null, pierce: !!o.pierce, hit: null, didHit: false, aimed: !!o.target, knock: o.knock || 0, sever: !!o.sever, charge: !!o.charge, bend: o.bend || 0, t: 0 });
    this.list.push(p); return p;
  }
  fireEnemy(o) { const p = this.epool.pop() || {}; Object.assign(p, { x: o.x, y: o.y, z: o.z, px: o.x, py: o.y, pz: o.z, vx: o.vx, vy: o.vy, vz: o.vz, life: o.life, dmg: o.dmg, style: o.style || 'bile', color: o.color || 0x6aff2a, gravity: o.gravity || 0, r: o.r || 0.35, puddle: o.puddle || 0, t: 0 }); this.eshots.push(p); }
  // step: enemies = array of {alive, x,z,r,height,headY, y (base), hurt(dmg,dir,head,proj)} ; player = {x,z,r, hurt(dmg, dirx, dirz, src)}
  fixedUpdate(step, enemies, player, world) {
    const R = world ? world.THEME.radius + 6 : 40;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += step; p.life -= step; p.px = p.x; p.py = p.y; p.pz = p.z;
      // homing / bullet bend toward target
      const tg = p.target; if (tg && tg.alive && (p.homing || p.bend)) {
        const ty = tg.y + tg.height * 0.55; let dx = tg.x - p.x, dy = ty - p.y, dz = tg.z - p.z; const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
        const rate = (p.homing || p.bend) * Math.PI / 180 * step; const vl = Math.hypot(p.vx, p.vy, p.vz) || 1; let vx = p.vx / vl, vy = p.vy / vl, vz = p.vz / vl;
        const dot = clamp(vx * dx + vy * dy + vz * dz, -1, 1); const ang = Math.acos(dot); if (ang > 1e-4 && (p.homing || d < 2.5)) { const k = Math.min(1, rate / ang); vx += (dx - vx) * k; vy += (dy - vy) * k; vz += (dz - vz) * k; const l2 = Math.hypot(vx, vy, vz) || 1; p.vx = vx / l2 * vl; p.vy = vy / l2 * vl; p.vz = vz / l2 * vl; }
      }
      if (p.style === 'disc') { p.vy -= 3.5 * step; }
      p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
      let dead = p.life <= 0 || p.y < 0.02 || Math.hypot(p.x, p.z) > R;
      if (p.y < 0.02 && p.aoe) { this.explode(p, enemies, null); dead = true; }
      // hits
      if (!dead) for (const e of enemies) {
        if (!e.alive || e.iframes > 0 || e.noHit) continue; if (p.hit === e) continue;
        const hy = e.y || 0; if (p.y < hy - 0.2 || p.y > hy + e.height + 0.4) continue;
        if (segCircleXZ(p.px, p.pz, p.x, p.z, e.x, e.z, e.r + 0.18)) {
          let head; if (e.boss) head = !!e.weakOpen && p.y > hy + e.height * 0.42; else if (e.def && e.def.swim) { const fx = Math.sin(e.face), fz = Math.cos(e.face); head = ((p.x - e.x) * fx + (p.z - e.z) * fz) > e.r * 0.45; } else head = p.y > hy + (e.headY ?? e.height * 0.85) - 0.3; const dl = Math.hypot(p.vx, p.vz) || 1;
          if (p.aoe) { this.explode(p, enemies, e); dead = true; break; }
          e.hurt(head ? p.head : p.dmg, p.vx / dl, p.vz / dl, head, p); p.hit = e; p.didHit = true; if (!p.pierce) { dead = true; break; }
        }
      }
      // trail
      this.trail(p, step);
      if (dead) { if (p.aimed && !p.didHit) this.ctx.game.onMiss?.(); this.list[i] = this.list[this.list.length - 1]; this.list.pop(); this.pool.push(p); }
    }
    for (let i = this.eshots.length - 1; i >= 0; i--) {
      const p = this.eshots[i]; p.t += step; p.life -= step; p.px = p.x; p.py = p.y; p.pz = p.z; p.vy -= p.gravity * step; p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
      let dead = p.life <= 0;
      if (p.y <= 0.05) { dead = true; if (p.puddle) this.ctx.game.puddle(p.x, p.z, p.puddle, p.color); this.ctx.particlesAdd.burst(p.x, 0.1, p.z, { n: 10, type: P.DOT, color: C.set(p.color), speed: 2, life: 0.4, size: 0.12, gravity: 4 }); }
      else if (player && player.alive && segCircleXZ(p.px, p.pz, p.x, p.z, player.x, player.z, player.r + p.r) && p.y < 2.2) { const dl = Math.hypot(p.vx, p.vz) || 1; player.hurt(p.dmg, p.vx / dl, p.vz / dl, 'shot'); dead = true; this.ctx.particlesAdd.burst(p.x, p.y, p.z, { n: 12, type: P.DOT, color: C.set(p.color), speed: 3, life: 0.35, size: 0.14 }); }
      else this.ctx.particlesAdd.one(p.x, p.y, p.z, { type: P.DOT, color: C.set(p.color), life: 0.25, size: 0.36, sizeEnd: 0.1, vx: 0, vy: 0, vz: 0 });
      if (dead) { this.eshots[i] = this.eshots[this.eshots.length - 1]; this.eshots.pop(); this.epool.push(p); }
    }
  }
  trail(p, step) {
    const A = this.ctx.particlesAdd; C.set(p.color);
    if (p.style === 'bolt') { A.one(p.x, p.y, p.z, { type: P.BOLT, color: C, life: 0.09, size: p.charge ? 1.4 : 0.7, sizeEnd: p.charge ? 1.2 : 0.4, vx: p.vx * 0.1, vy: p.vy * 0.1, vz: p.vz * 0.1, stretch: 0.9, fadeIn: 0.01 }); }
    else if (p.style === 'disc') { A.one(p.x, p.y, p.z, { type: P.DISC, color: C, life: 0.07, size: p.charge ? 1.1 : 0.62, sizeEnd: p.charge ? 1.1 : 0.62, vx: 0, vy: 0, vz: 0, spin: 40, fadeIn: 0.01 }); A.one(p.x, p.y, p.z, { type: P.DOT, color: C, life: 0.25, size: 0.3, sizeEnd: 0.05, vx: 0, vy: 0, vz: 0 }); }
    else if (p.style === 'torpedo') { A.one(p.x, p.y, p.z, { type: P.DOT, color: C, life: 0.12, size: 0.42, sizeEnd: 0.2, vx: 0, vy: 0, vz: 0 }); if (Math.random() < 0.5) A.one(p.x, p.y, p.z, { type: P.BUBBLE, color: C, life: 0.9, size: 0.12, sizeEnd: 0.2, vx: (Math.random() - .5), vy: 1.2, vz: (Math.random() - .5), fadeIn: 0.1 }); }
  }
  explode(p, enemies, direct) {
    const g = this.ctx.game; const r = p.aoe; C.set(p.color);
    this.ctx.particlesAdd.burst(p.x, p.y, p.z, { n: p.charge ? 70 : 30, type: P.SPARK, color: C, color2: new THREE.Color(0xffffff), speed: 7 * r, life: 0.5, size: 0.2, gravity: 6, stretch: 0.5 });
    this.ctx.particlesAdd.one(p.x, p.y, p.z, { type: P.RING, color: C, life: 0.35, size: 0.5, sizeEnd: r * 2.4, vx: 0, vy: 0, vz: 0, fadeIn: 0.02 });
    this.ctx.particlesAlpha.burst(p.x, p.y, p.z, { n: 8, type: P.SMOKE, color: new THREE.Color(0x202028), speed: 1.5, life: 0.9, size: 0.6, sizeEnd: 1.6, gravity: -0.5 });
    g.shake(p.charge ? 0.35 : 0.15); g.audio.play(p.style === 'disc' ? 'sfx_bonesaw_hit' : 'sfx_depth_explode', { x: p.x, z: p.z, vol: 0.9, vary: 0.1 });
    g.lightFlash(p.x, p.y, p.z, p.color, 1.5);
    for (const e of enemies) { if (!e.alive) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < r + e.r) { p.didHit = true; const f = 1 - clamp((d - e.r) / r, 0, 1) * 0.5; const dl = d || 1; e.hurt(p.dmg * f, (e.x - p.x) / dl, (e.z - p.z) / dl, e === direct && Math.abs(p.y - ((e.y || 0) + (e.headY ?? e.height * 0.85))) < 0.28, p); } }
  }
}
