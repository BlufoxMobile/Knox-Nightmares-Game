// Bosses: three-phase fights with named, telegraphed attacks, intros, enrage and weak-spot windows.
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { COPY } from './data/copy.js';
import { P } from '../render/particles.js';
import { D } from '../render/decals.js';
import { clamp, rnd, pick, angDiff, damp } from '../core/math.js';

const _c = new THREE.Color(); const RED = 0xff2438;

export class Boss extends Enemy {
  spawn(x, z, opts = {}) {
    super.spawn(x, z, { emerge: 0.01, kind: 'ground' }); this.noHit = true; this.noLock = true; this.bossIntro = true; this.phase = 1; this.enraged = false; this.weakOpen = false; this.moveCd = 2.5; this.move = null; this.mt = 0; this.adds = 0; this.blackoutT = 0; this.state = 'intro'; this.inner.position.y = -this.proto.minY * this.proto.baseScale;
    if (this.def.swim) { this.y = 6; this.ty = 6; }
    this.game.director.bossIntro(this);
  }
  beginFight() { this.bossIntro = false; this.noHit = false; this.noLock = false; this.state = 'move'; this.moveCd = 2.0; }
  hurt(dmg, dx, dz, head, proj) {
    if (!this.alive || this.noHit || this.bossIntro) return; const before = this.hp; super.hurt(dmg, dx, dz, head, proj); if (!this.alive) return;
    const f = this.hp / this.maxhp; const g = this.game;
    if (this.phase === 1 && f <= 0.66) this.phaseChange(2); else if (this.phase === 2 && f <= 0.33) this.phaseChange(3);
    if (!this.enraged && f <= 0.4) { this.enraged = true; g.hud.banner(COPY.banners.enrage, 'normal'); g.audio.play('sfx_' + this.def.voice + '_roar', { vol: 1 }); g.audio.setMusicMix({ boss: 1, combat: 0.6 }, 1); }
    g.hud.bossHP(this.hp / this.maxhp, true);
  }
  phaseChange(p) {
    const g = this.game; this.phase = p; this.stagger = 1.0; this.weakOpen = true; this.weakT = 3.0; this.state = 'move'; this.move = null; this.moveCd = 2.0; g.loop.stopTime(120); g.shake(0.6); g.spawnPickup(this.x + rnd(-2, 2), this.z + rnd(-2, 2), 'heart');
    g.audio.play('sfx_' + this.def.voice + '_roar', { vol: 1, rate: 0.9 }); g.audio.musicDuck(0.15, 1.2);
    this.ctx.particlesAdd.burst(this.x, this.y + this.height * 0.5, this.z, { n: 60, type: P.SPARK, color: _c.set(RED), speed: 8, life: 0.7, size: 0.2 });
    if (this.key === 'hollowstag' && p === 3) { this.blackoutCycle = 0; }
    if (this.key === 'rotking' && p === 2) { this.severArm(0, 0); g.hud.stamp('ARM OFF', 'red'); }
    if (this.key === 'megalodon' && p === 3) { g.world.env.blackwater && g.world.env.blackwater(1); }
    if (this.anim) this.anim.shot(this.def.clips.stomp, null, 0.05, { timeScale: 1.2 });
  }
  die(dx, dz, head, proj) { const g = this.game; super.die(dx, dz, head, proj); g.onBossDeath(this); }
  fixedUpdate(step, player, enemies) {
    if (this.state === 'intro') { this.px = this.x; this.pz = this.z; return; }
    if (this.weakOpen) { this.weakT -= step; if (this.weakT <= 0) this.weakOpen = false; }
    super.fixedUpdate(step, player, enemies);
  }
}

// --- generic boss brain: picks a move by phase, runs it, cools down ---
function bossBrain(moves) {
  return function (e, step, player, dist, nx, nz, g) {
    if (e.stagger > 0) return;
    if (e.move) { const done = e.move.run(e, step, player, dist, nx, nz, g); if (done) { e.move = null; e.moveCd = e.enraged ? rnd(0.9, 1.6) : rnd(1.4, 2.4); e.state = 'move'; } return; }
    e.moveCd -= step;
    if (e.moveCd <= 0) { const pool = moves.filter(m => m.phases.includes(e.phase) && (!m.can || m.can(e, dist, g))); const m = pick(pool); if (m) { e.move = m; e.mt = 0; e.ms = 0; m.start(e, player, dist, nx, nz, g); return; } }
    // default: stalk toward the player (bosses keep ~4 m unless a move closes)
    const keep = e.def.swim ? 9 : 4.5; e.state = 'move';
    if (dist > keep) e.moveToward(player.x, player.z, e.def.speed * (e.enraged ? 1.15 : 1), step); else { e.orbit += step * 0.35 * e.circleDir; e.moveToward(player.x - Math.sin(e.orbit) * keep, player.z - Math.cos(e.orbit) * keep, e.def.speed * 0.7, step); e.faceTo(nx, nz, step, 5); }
    if (e.def.swim) { e.ty = e.phase === 2 ? 5 : 2.5; }
  };
}
function lineDecal(e, g, nx, nz, len, life) { return g.decals.add(e.x + nx * len * 0.5, e.z + nz * len * 0.5, { type: D.LINE, size: len * 1.02, rot: -Math.atan2(nx, nz), color: _c.set(RED), life: life + 0.1, alpha: 0.55, fadeIn: 0.15 }); }
function killDecal(e, g) { if (e.decal != null) { g.decals.kill(e.decal); e.decal = null; } }
function hitPlayerRadius(e, player, x, z, r, dmg, g) { const d = Math.hypot(player.x - x, player.z - z); if (d < r + player.r) { const dl = d || 1; return player.hurt(dmg, (player.x - x) / dl, (player.z - z) / dl, e.key); } return false; }

// shared moves
const lunge = (name, windup, len, speed, dmg, clip) => ({ name, phases: [1, 2, 3], can: (e, d) => d > 3 && d < len, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = windup; e.vx = e.vz = 0; e.lx = nx; e.lz = nz; e.decal = lineDecal(e, g, nx, nz, len, windup); g.audio.play('sfx_' + e.def.voice + '_windup', { x: e.x, z: e.z, vol: 1 }); if (e.anim) e.anim.shot(clip || e.def.clips.stomp, null, 0.05, { timeScale: 1.43 / windup }); e.ms = 0; e.hitDone = false; },
  run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; e.faceTo(e.lx, e.lz, step, 10); if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); e.state = 'lunge'; g.audio.play('sfx_' + e.def.voice + '_roar', { x: e.x, z: e.z, vol: 0.9, rate: 1.1 }); if (e.anim) e.anim.play(e.def.clips.rush || e.def.clips.move, 0.1); } return false; }
    const dur = len / speed; e.vx = e.lx * speed; e.vz = e.lz * speed; e.x += e.vx * step; e.z += e.vz * step; if (Math.random() < 0.7) e.ctx.particlesAlpha.one(e.x + rnd(-1, 1), 0.2, e.z + rnd(-1, 1), { type: P.SMOKE, color: _c.set(0x1a1410), life: 0.7, size: 0.7, sizeEnd: 1.6, vx: 0, vy: 0.6, vz: 0 });
    if (!e.hitDone && hitPlayerRadius(e, p, e.x + e.lx * e.r, e.z + e.lz * e.r, e.r + 0.4, dmg, g)) { e.hitDone = true; g.shake(0.5); }
    if (e.mt > dur) { e.vx = e.vz = 0; e.state = 'move'; return true; } return false; } });
const cone = (name, phases, windup, range, angle, dmg, clip) => ({ name, phases, can: (e, d) => d < range + 1.5, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = windup; e.vx = e.vz = 0; e.decal = g.decals.add(e.x + nx * range * 0.5, e.z + nz * range * 0.5, { type: D.CONE, size: range * 2.1, rot: -Math.atan2(nx, nz) + Math.PI, color: _c.set(RED), life: windup + 0.15, alpha: 0.6, fadeIn: 0.2 }); if (e.anim) e.anim.shot(clip, null, 0.05, { timeScale: 1.87 / (windup + 0.4) }); g.audio.play('sfx_' + e.def.voice + '_windup', { x: e.x, z: e.z, vol: 1 }); },
  run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; e.faceTo(nx, nz, step, 4); if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); const ang = Math.abs(angDiff(e.face, Math.atan2(nx, nz))); if (d < range + p.r && ang < angle * Math.PI / 360) p.hurt(dmg, nx, nz, e.key); g.shake(0.45); g.audio.play('sfx_' + e.def.voice + '_swing', { x: e.x, z: e.z, vol: 1 }); e.ctx.particlesAlpha.burst(e.x + nx * 2, 0.3, e.z + nz * 2, { n: 16, type: P.SMOKE, color: _c.set(0x1a1410), speed: 3, life: 0.8, size: 0.6, sizeEnd: 1.8 }); } return false; } return e.mt > 0.8; } });
const slam = (name, phases, windup, radius, dmg, leap) => ({ name, phases, can: (e, d) => d < 14, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = windup; e.tx = p.x; e.tz = p.z; e.sx = e.x; e.sz = e.z; e.vx = e.vz = 0; e.decal = g.decals.add(e.tx, e.tz, { type: D.DISC, size: radius * 2, color: _c.set(RED), life: windup + 0.15, alpha: 0.5, fadeIn: 0.1, tele: true }); if (e.anim) e.anim.shot(leap ? e.def.clips.leap : e.def.clips.slam, null, 0.05, { timeScale: (leap ? 2.37 : 1.87) / (windup + 0.3) }); g.audio.play('sfx_' + e.def.voice + '_roar', { x: e.x, z: e.z, vol: 0.8, rate: 1.2 }); },
  run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; const u = clamp(1 - e.windup / windup, 0, 1); if (leap) { e.x = e.sx + (e.tx - e.sx) * u; e.z = e.sz + (e.tz - e.sz) * u; e.inner.position.y = -e.proto.minY * e.proto.baseScale + Math.sin(u * Math.PI) * 6; e.noHit = u < 0.85; } e.faceTo(e.tx - e.x, e.tz - e.z, step, 6);
      if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); e.noHit = false; e.inner.position.y = -e.proto.minY * e.proto.baseScale; const cx = leap ? e.x : e.x + Math.sin(e.face) * e.r, cz = leap ? e.z : e.z + Math.cos(e.face) * e.r; if (hitPlayerRadius(e, p, cx, cz, radius, dmg, g)) { p.vx += nx * 8; p.vz += nz * 8; } g.shake(0.85); g.loop.stopTime(60); g.audio.play('sfx_boss_slam', { vol: 1 }); g.decals.add(cx, cz, { type: D.CRACK, size: radius * 2.4, color: _c.set(0x000000), life: 30, alpha: 0.8 }); e.ctx.particlesAdd.one(cx, 0.3, cz, { type: P.RING, color: _c.set(0xffb070), life: 0.5, size: 1, sizeEnd: radius * 3, vx: 0, vy: 0, vz: 0 }); e.ctx.particlesAlpha.burst(cx, 0.2, cz, { n: 40, type: P.CHUNK, color: _c.set(0x3a2a1a), speed: 7, life: 1, size: 0.15, gravity: 12, up: 4 }); e.ctx.particlesAlpha.burst(cx, 0.3, cz, { n: 20, type: P.SMOKE, color: _c.set(0x201810), speed: 3, life: 1.2, size: 0.8, sizeEnd: 2.4 }); } return false; } return e.mt > 0.9; } });
const volley = (name, phases, windup, count, color, puddle, dmg) => ({ name, phases, can: (e, d) => d > 4, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = windup; e.vx = e.vz = 0; e.targets = []; for (let i = 0; i < count; i++) { const a = rnd(0, Math.PI * 2), r = i === 0 ? 0 : rnd(1.5, 4); const tx = p.x + p.vx * 0.5 + Math.cos(a) * r, tz = p.z + p.vz * 0.5 + Math.sin(a) * r; e.targets.push([tx, tz, g.decals.add(tx, tz, { type: D.RING, size: 4.6, color: _c.set(color), life: windup + 1.3, alpha: 0.6, fadeIn: 0.2 })]); } if (e.anim) e.anim.shot(e.def.clips.attack, null, 0.05, { timeScale: 3.5 / (windup + 0.5) }); g.audio.play('sfx_' + e.def.voice + '_windup', { x: e.x, z: e.z, vol: 1 }); },
  run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; e.faceTo(nx, nz, step, 4); if (e.windup <= 0) { e.ms = 1; e.mt = 0; for (const [tx, tz] of e.targets) { const dx = tx - e.x, dz = tz - e.z; const T = 1.2; g.projectiles.fireEnemy({ x: e.x, y: e.y + e.height * 0.8, z: e.z, vx: dx / T, vy: 5 + e.height * 0.8 / T, vz: dz / T, life: 3, dmg, gravity: 9, color, puddle, r: 0.5 }); } g.audio.play('sfx_bloater_spit', { x: e.x, z: e.z, vol: 1 }); } return false; } return e.mt > 0.6; } });
const summon = (name, phases, type, count, kindOverride, banner) => ({ name, phases, can: (e, d, g) => g.director.addCount() + count <= 4, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = 1.4; e.vx = e.vz = 0; if (e.anim) e.anim.shot(e.def.clips.scream, null, 0.05, { timeScale: 2 }); g.audio.play('sfx_' + e.def.voice + '_call', { x: e.x, z: e.z, vol: 1 }); if (banner) g.hud.banner(banner, 'small'); },
  run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; if (e.windup <= 0) { e.ms = 1; for (let i = 0; i < count; i++) g.director.spawnAdd(type, kindOverride); } return false; } return e.mt > 2.0; } });

// ---------- THE HOLLOW STAG ----------
const stagMoves = [
  lunge('Antler Lunge', 0.9, 12, 11, 25, null), cone('Shadow Sweep', [2, 3], 1.2, 5.5, 120, 30, 'slam'), summon('The Call', [1], 'crawler', 2, 'treeline', null), summon('Stampede', [2], 'crawler', 3, 'treeline', null),
  { name: 'Bone Toss', phases: [1, 2], can: (e, d) => d > 5, ...volley('Bone Toss', [1, 2], 1.1, 3, 0xd9d2bd, 0, 15) },
  { name: 'Blink Lunge', phases: [3], can: (e, d) => true, start(e, p, d, nx, nz, g) { const a = rnd(0, Math.PI * 2); e.x = p.x + Math.cos(a) * 8; e.z = p.z + Math.sin(a) * 8; const dd = Math.hypot(p.x - e.x, p.z - e.z) || 1; e.lx = (p.x - e.x) / dd; e.lz = (p.z - e.z) / dd; e.face = Math.atan2(e.lx, e.lz); e.state = 'windup'; e.windup = 0.7; e.vx = e.vz = 0; e.decal = lineDecal(e, g, e.lx, e.lz, 10, 0.7); g.audio.play('sfx_stag_click', { x: e.x, z: e.z, vol: 1 }); e.ms = 0; e.hitDone = false; g.world.env.eyes && g.world.env.eyes(1); },
    run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); e.state = 'lunge'; if (e.anim) e.anim.play(e.def.clips.rush, 0.05); } return false; } e.vx = e.lx * 12; e.vz = e.lz * 12; e.x += e.vx * step; e.z += e.vz * step; if (!e.hitDone && hitPlayerRadius(e, p, e.x, e.z, e.r + 0.5, 30, g)) { e.hitDone = true; g.shake(0.5); } if (e.mt > 10 / 12) { e.vx = e.vz = 0; return true; } return false; } },
  summon('Whisper Swarm', [3], 'crawler', 2, 'treeline', null),
];
// ---------- THE ROT KING ----------
const kingMoves = [
  slam('Grave Slam', [1, 2], 1.15, 5, 30, true), volley('Rot Volley', [1, 2, 3], 1.2, 3, 0x6aff2a, 2.5, 15), summon('RISE!', [1], 'rotter', 3, 'grave', 'RISE.'), summon('Corpse Wall', [2], 'rotter', 4, 'grave', null),
  { name: 'Arm Throw', phases: [2, 3], can: (e, d) => d > 3, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = 1.0; e.vx = e.vz = 0; e.lx = nx; e.lz = nz; e.decal = lineDecal(e, g, nx, nz, 14, 1.0); if (e.anim) e.anim.shot(e.def.clips.attack, null, 0.05, { timeScale: 2 }); g.audio.play('sfx_king_windup', { x: e.x, z: e.z, vol: 1 }); e.ms = 0; },
    run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; e.faceTo(e.lx, e.lz, step, 8); if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); g.projectiles.fireEnemy({ x: e.x, y: 1.3, z: e.z, vx: e.lx * 14, vy: 0, vz: e.lz * 14, life: 2.0, dmg: 25, gravity: 0, color: 0x9fd08a, r: 0.7, style: 'arm' }); g.audio.play('sfx_whoosh', { x: e.x, z: e.z, vol: 1 }); } return false; } return e.mt > 2.2; } },
  { name: 'Frenzy Chase', phases: [3], can: () => true, start(e, p, d, nx, nz, g) { e.state = 'rush'; e.mt = 0; e.ms = 0; g.audio.play('sfx_king_roar', { x: e.x, z: e.z, vol: 1 }); g.hud.banner('IT WANTS YOU.', 'small'); if (e.anim) e.anim.play(e.def.clips.rush, 0.1); e.hitCd = 0; },
    run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { const sp = 5.8; e.face = e.face + clamp(angDiff(e.face, Math.atan2(nx, nz)), -2.1 * step, 2.1 * step); e.vx = Math.sin(e.face) * sp; e.vz = Math.cos(e.face) * sp; e.x += e.vx * step; e.z += e.vz * step; e.hitCd -= step; if (d < e.r + p.r + 0.6 && e.hitCd <= 0) { e.hitCd = 0.9; if (p.hurt(25, nx, nz, e.key)) g.shake(0.4); } if (e.mt > 4) { e.ms = 1; e.mt = 0; e.vx = e.vz = 0; e.weakOpen = true; e.weakT = 3; e.state = 'move'; if (e.anim) e.anim.shot(e.def.clips.hit, null, 0.1, { timeScale: 0.5 }); g.hud.stamp('EXHAUSTED — HIT IT', 'gold'); } return false; } return e.mt > 3; } },
  summon('The Choir', [3], 'rotter', 3, 'grave', null),
];
// ---------- MEGALODON ----------
const megMoves = [
  lunge('Bull Rush', 1.2, 20, 14, 30, null), summon('Chum', [1], 'reaper', 2, 'water', null), summon('Feeding Frenzy', [2], 'reaper', 3, 'water', null),
  { name: 'Dive Bomb', phases: [2, 3], can: (e, d) => d < 16, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = 1.4; e.tx = p.x; e.tz = p.z; e.ty = 9; e.decal = g.decals.add(e.tx, e.tz, { type: D.DISC, size: 2, color: _c.set(0x000000), life: 1.5, alpha: 0.8, fadeIn: 0.1 }); e.ms = 0; g.audio.play('sfx_meg_sub', { vol: 1 }); },
    run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; const u = clamp(1 - e.windup / 1.4, 0, 1); e.x = damp(e.x, e.tx, 3, step); e.z = damp(e.z, e.tz, 3, step); if (e.decal != null) g.decals.set(e.decal, e.tx, e.tz, { type: D.DISC, size: 2 + u * 10, color: _c.set(0x000000), life: 1.5, alpha: 0.85, fadeIn: 0.01 }); e.faceTo(nx, nz, step, 3); if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); e.ty = 1.2; e.y = 1.5; hitPlayerRadius(e, p, e.tx, e.tz, 4, 35, g); g.shake(1); g.loop.stopTime(80); g.audio.play('sfx_boss_slam', { vol: 1 }); e.ctx.particlesAdd.one(e.tx, 0.4, e.tz, { type: P.RING, color: _c.set(0x9fe8ff), life: 0.9, size: 2, sizeEnd: 24, vx: 0, vy: 0, vz: 0 }); e.ctx.particlesAdd.burst(e.tx, 0.5, e.tz, { n: 80, type: P.BUBBLE, color: _c.set(0xbfe8ff), speed: 6, life: 1.5, size: 0.2, up: 3 }); e.shockR = 0; } return false; } e.shockR += 10 * step; if (!e.shockHit && Math.abs(Math.hypot(p.x - e.tx, p.z - e.tz) - e.shockR) < 0.8 && e.shockR > 4.5) { e.shockHit = p.hurt(15, nx, nz, e.key); } if (e.mt > 1.6) { e.shockHit = false; e.ty = 3; return true; } return false; } },
  { name: 'Ambush Bite', phases: [3], can: () => true, start(e, p, d, nx, nz, g) { const a = rnd(0, Math.PI * 2); e.x = p.x + Math.cos(a) * 7; e.z = p.z + Math.sin(a) * 7; e.y = 1.5; e.ty = 1.2; const dd = Math.hypot(p.x - e.x, p.z - e.z) || 1; e.lx = (p.x - e.x) / dd; e.lz = (p.z - e.z) / dd; e.face = Math.atan2(e.lx, e.lz); e.state = 'windup'; e.windup = 0.9; e.decal = lineDecal(e, g, e.lx, e.lz, 9, 0.9); g.audio.play('sfx_sonar', { vol: 1 }); e.ms = 0; e.hitDone = false; },
    run(e, step, p, d, nx, nz, g) { e.mt += step; if (e.ms === 0) { e.windup -= step; if (e.windup <= 0) { e.ms = 1; e.mt = 0; killDecal(e, g); e.state = 'lunge'; } return false; } e.vx = e.lx * 14; e.vz = e.lz * 14; e.x += e.vx * step; e.z += e.vz * step; if (!e.hitDone && hitPlayerRadius(e, p, e.x + e.lx * 2, e.z + e.lz * 2, 2.2, 35, g)) { e.hitDone = true; g.shake(0.6); g.bloodScreen(); g.audio.play('sfx_shark_bite', { vol: 1 }); } if (e.mt > 9 / 14) { e.vx = e.vz = 0; e.ty = 3; return true; } return false; } },
  { name: 'Whirlpool', phases: [3], can: (e, d) => d < 12, start(e, p, d, nx, nz, g) { e.state = 'windup'; e.windup = 2.0; e.wx = p.x; e.wz = p.z; e.decal = g.decals.add(e.wx, e.wz, { type: D.RING, size: 12, color: _c.set(0x7fd8ff), life: 2.5, alpha: 0.6, fadeIn: 0.3, rot: 0 }); g.audio.play('sfx_whirl', { vol: 0.9 }); e.ms = 0; },
    run(e, step, p, d, nx, nz, g) { e.mt += step; const dx = e.wx - p.x, dz = e.wz - p.z; const dd = Math.hypot(dx, dz) || 1; if (dd < 6 && p.roll.t < 0) { p.x += dx / dd * 3 * step; p.z += dz / dd * 3 * step; } if (e.mt > 2.0 && e.ms === 0) { e.ms = 1; killDecal(e, g); if (dd < 1.6) p.hurt(20, -dx / dd, -dz / dd, e.key); e.ctx.particlesAdd.one(e.wx, 0.3, e.wz, { type: P.RING, color: _c.set(0x9fe8ff), life: 0.5, size: 1, sizeEnd: 14, vx: 0, vy: 0, vz: 0 }); } return e.mt > 2.4; } },
];
export const BOSS_BRAINS = { hollowstag: bossBrain(stagMoves), rotking: bossBrain(kingMoves), megalodon: bossBrain(megMoves) };
