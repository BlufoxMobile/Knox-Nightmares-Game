// Wave director: budgets, spawn places, attack tokens, pickups, breathers and the boss handoff.
import * as THREE from 'three';
import { Enemy, EnemyProto } from './Enemy.js';
import { Boss } from './Boss.js';
import { ENEMIES } from './data/enemies.js';
import { COPY } from './data/copy.js';
import { P } from '../render/particles.js';
import { rnd, pick, clamp } from '../core/math.js';

const WAVES = {
  // Wave SIZE, not concurrency, was the real limiter: with 24 monsters queued and the player killing
  // ~0.9/s, the arena averaged 2.8 live enemies against a cap of 11. These queues keep it full.
  // World 1 still opens gently -- wave 1 is eight monsters and nothing that shoots.
  forest: [{ cap: 6, list: [['stalker', 8]] },
    { cap: 8, list: [['stalker', 10], ['crawler', 6]] },
    { cap: 10, list: [['stalker', 13], ['crawler', 8], ['thorn', 3]] },
    { cap: 11, list: [['stalker', 14], ['crawler', 10], ['thorn', 4], ['alpha', 1]] },
    { cap: 12, list: [['stalker', 16], ['crawler', 12], ['thorn', 5], ['alpha', 2]] },
    { cap: 13, list: [['stalker', 18], ['crawler', 14], ['thorn', 6], ['alpha', 3]] }],
  grave: [{ cap: 6, list: [['rotter', 9]] },
    { cap: 8, list: [['rotter', 13], ['bloater', 3]] },
    { cap: 10, list: [['rotter', 16], ['bloater', 5]] },
    { cap: 12, list: [['rotter', 18], ['bloater', 7], ['brute', 1]] },
    { cap: 13, list: [['rotter', 21], ['bloater', 8], ['brute', 2]] },
    { cap: 14, list: [['rotter', 24], ['bloater', 10], ['brute', 3]] }],
  sea: [{ cap: 6, list: [['reaper', 8]] },
    { cap: 8, list: [['reaper', 10], ['lantern', 4]] },
    { cap: 9, list: [['reaper', 12], ['lantern', 6]] },
    { cap: 10, list: [['reaper', 13], ['lantern', 7], ['warden', 1]] },
    { cap: 11, list: [['reaper', 15], ['lantern', 8], ['warden', 2]] },
    { cap: 12, list: [['reaper', 16], ['lantern', 9], ['warden', 3]] }],
};
const _c = new THREE.Color();

export class Director {
  constructor(ctx) { this.ctx = ctx; this.game = ctx.game; this.enemies = []; this.pools = {}; this.protos = {}; this.tokens = { melee: 3, ranged: 2 }; this.held = { melee: [], ranged: [] }; this.pickups = []; this.puddles = []; }
  setup(worldKey) {
    this.worldKey = worldKey; this.waves = WAVES[worldKey]; this.waveIdx = -1; this.queue = []; this.spawnT = 0; this.state = 'idle'; this.stateT = 0; this.boss = null; this.killsThisWave = 0; this.wakesOnWave = 0;
    this.clearAll();
    // preload protos for this world's enemy set + boss
    const types = new Set(); for (const w of this.waves) for (const [t] of w.list) types.add(t); types.add(this.game.world.THEME.boss); if (worldKey === 'forest') { types.add('crawler'); types.add('alpha'); } if (worldKey === 'grave') types.add('rotter'); if (worldKey === 'sea') types.add('reaper');
    for (const t of types) { if (!this.protos[t]) this.protos[t] = new EnemyProto(this.ctx, t); }
    this.tokens.melee = this.game.difficulty === 'brutal' ? 4 : 3; this.maxWaveReached = -1; this.mercy = 0;
  }
  clearAll() { for (const e of this.enemies) e.despawn(); this.enemies.length = 0; for (const p of this.pickups) this.ctx.scene.remove(p.obj); this.pickups.length = 0; this.puddles.length = 0; this.held.melee.length = 0; this.held.ranged.length = 0; this.boss = null; }
  disposeAll() { this.clearAll(); for (const k in this.pools) for (const e of this.pools[k]) { this.ctx.scene.remove(e.root); } this.pools = {}; this.protos = {}; }
  get(type) { const pool = this.pools[type] || (this.pools[type] = []); let e = pool.find(x => !x.alive && x.state === 'dead'); if (!e) { e = ENEMIES[type].boss ? new Boss(this.ctx, this.protos[type]) : new Enemy(this.ctx, this.protos[type]); pool.push(e); } return e; }
  alive() { return this.enemies.filter(e => e.alive); }
  addCount() { return this.enemies.filter(e => e.alive && !e.boss).length; }
  // ---- tokens ----
  request(kind, e) { const list = this.held[kind]; if (list.includes(e)) return kind; if (list.length >= this.tokens[kind]) return null; list.push(e); return kind; }
  release(kind, e) { const list = this.held[kind]; const i = list.indexOf(e); if (i >= 0) list.splice(i, 1); }
  // ---- flow ----
  startLevel() { this.waveIdx = -1; this.state = 'prewave'; this.stateT = 2.2; this.game.hud.setWorld(this.game.world.THEME.name, ''); }
  nextWave() {
    this.waveIdx++; const g = this.game; if (this.waveIdx >= this.waves.length) { this.state = 'breather'; this.stateT = 7; g.hud.banner(COPY.banners.bigger, 'small'); g.audio.setMusicMix({ bed: 1, combat: 0 }, 2); g.spawnChest(); return; }
    const w = this.waves[this.waveIdx]; this.queue = [];
    if (this.waveIdx > this.maxWaveReached) { this.maxWaveReached = this.waveIdx; this.wakesOnWave = 0; }
    // mercy: after two wake-ups on the SAME wave the arena thins out and breathes. The retry loop has
    // to stay forgiving for a ten-year-old -- the difficulty lives in the first attempt, not the fifth.
    this.mercy = clamp(this.wakesOnWave - 1, 0, 3);
    // How many monsters may be winding up an attack at once. Two was the real reason a crowd of twelve
    // felt safe: ten of them were politely queueing.
    this.tokens.melee = (this.game.difficulty === 'brutal' ? 4 : 3) + (this.waveIdx >= 2 ? 1 : 0) + (this.waveIdx >= 4 ? 1 : 0) - (this.mercy >= 2 ? 1 : 0);
    this.tokens.ranged = 2 + (this.waveIdx >= 3 ? 1 : 0); for (const [t, n] of w.list) for (let i = 0; i < n; i++) this.queue.push(t); this.queue.sort(() => Math.random() - 0.5);
    // trickle: first wave slower
    this.spawnGap = ([2.9, 1.9, 1.5, 1.25, 1.1, 0.95][this.waveIdx] ?? 0.95) * (1 + this.mercy * 0.18); this.spawnT = 0.5; this.cap = Math.max(4, w.cap + (g.difficulty === 'brutal' ? 1 : 0) - this.mercy); this.state = 'wave'; this.stateT = 0; this.killsThisWave = 0; this.spawned = 0;
    const th = g.world.THEME.key; const text = this.waveIdx === 0 ? COPY.banners.start : this.waveIdx === 1 ? COPY.banners.wave2 : this.waveIdx === 2 ? COPY.worlds[th].wave3 : this.waveIdx === 3 ? COPY.banners.more : this.waveIdx === 4 ? COPY.banners.run : COPY.banners.no;
    g.hud.banner(text, this.waveIdx >= 2 ? 'normal' : 'big'); g.hud.setWorld(g.world.THEME.name, `WAVE ${this.waveIdx + 1} / ${this.waves.length}`);
    g.audio.setMusicMix({ bed: 0.4, combat: Math.min(1, 0.6 + this.waveIdx * 0.15) }, 1.5); g.audio.play('sfx_wave_hit', { vol: 0.9 });
    if (th === 'grave' && this.waveIdx === 0) g.after(2.6, () => g.hud.banner(COPY.banners.graveBurst, 'small'), 'wave');
    if (th === 'grave') g.world.env.lampsOff && g.world.env.lampsOff(this.waveIdx * 2);
  }
  spawnPoint(kind) { const pts = this.game.world.env.spawnPoints || []; const pl = this.game.player; const cands = pts.filter(p => !kind || p.kind === kind); if (!cands.length) { const a = rnd(0, Math.PI * 2), R = this.game.world.THEME.radius - 2; return { x: Math.cos(a) * R, z: Math.sin(a) * R, kind: 'ground' }; }
    // prefer points behind the camera / far from the player (spawn out of sight)
    const cy = pl.cam.yaw; const fx = Math.sin(cy), fz = Math.cos(cy); const score = q => { const dx = q.x - pl.x, dz = q.z - pl.z; const d = Math.hypot(dx, dz) || 1; const cos = (dx * fx + dz * fz) / d; return Math.abs(cos) + (d < 8 ? 1 : 0); }; cands.sort((a, b) => score(a) - score(b)); return cands[Math.floor(rnd(0, Math.min(3, cands.length)))]; }
  spawnEnemy(type, kind) {
    const e = this.get(type); const def = ENEMIES[type]; const wk = this.worldKey === 'grave' ? 'grave' : this.worldKey === 'sea' ? 'water' : 'treeline';
    const sp = kind === 'ground' ? { x: rnd(-8, 8), z: rnd(-8, 8), kind: 'ground' } : kind === 'flank' ? this.flankSpawn(wk) : this.spawnPoint(kind || wk);
    let x = sp.x + rnd(-1, 1), z = sp.z + rnd(-1, 1); const R = this.game.world.THEME.radius - 1; const d = Math.hypot(x, z); if (d > R) { x *= R / d; z *= R / d; }
    e.spawn(x, z, { kind: sp.kind }); if (def.swim && sp.y) { e.y = sp.y; e.ty = sp.y; }
    if (!this.enemies.includes(e)) this.enemies.push(e);
    const g = this.game; g.audio.play('sfx_' + def.voice + '_spawn', { x, z, vol: 0.8, vary: 0.1, delay: 0 });
    if (sp.kind === 'grave') { g.decals.add(x, z, { type: 4, size: 2.2, color: _c.set(0x0a0804), life: 40, alpha: 0.9 }); g.shake(0.12); g.audio.play('sfx_grave_burst', { x, z, vol: 0.9 }); this.ctx.particlesAlpha.burst(x, 0.2, z, { n: 26, type: P.CHUNK, color: _c.set(0x2a2016), speed: 4, life: 1, size: 0.14, gravity: 10, up: 5 }); }
    return e;
  }
  // a spawn point on the far side of where the player is running, ~11-14 m out
  flankSpawn(kind) {
    const pl = this.game.player; const v = Math.hypot(pl.vx, pl.vz);
    const a = (v > 1.2 ? Math.atan2(pl.vx, pl.vz) : pl.cam.yaw + Math.PI) + rnd(-0.7, 0.7);
    const R = this.game.world.THEME.radius - 2; const rr = rnd(9, 13); let x = pl.x + Math.sin(a) * rr, z = pl.z + Math.cos(a) * rr;
    const d = Math.hypot(x, z); if (d > R) { x *= R / d; z *= R / d; }
    return { x, z, kind };
  }
  spawnAdd(type, kind) { const e = this.spawnEnemy(type, kind); return e; }
  bossIntro(boss) { this.boss = boss; this.game.bossIntro(boss); }
  fixedUpdate(step) {
    const g = this.game; const pl = g.player; if (g.state !== 'play') return;
    this.stateT -= step;
    if (this.state === 'prewave' && this.stateT <= 0) this.nextWave();
    else if (this.state === 'wave') {
      this.spawnT -= step; const aliveN = this.addCount();
      if (this.queue.length && this.spawnT <= 0 && aliveN < this.cap) {
        // from wave 3 every third monster lands across the player's line of retreat instead of at the
        // arena edge, so running away walks you into the next one
        this.spawned = (this.spawned || 0) + 1;
        this.spawnEnemy(this.queue.shift(), this.waveIdx >= 1 && this.spawned % 2 === 0 ? 'flank' : undefined);
        const fill = aliveN / this.cap; // the emptier the arena, the harder they come
        this.spawnT = this.spawnGap * rnd(0.7, 1.2) * (this.waveIdx === 0 ? 1 : fill < 0.5 ? 0.26 : fill < 0.8 ? 0.55 : 1);
      }
      if (!this.queue.length && aliveN <= (this.waveIdx >= 2 && this.mercy === 0 ? 2 : 0)) { this.state = 'between'; this.stateT = this.waveIdx === this.waves.length - 1 ? 1.0 : (4.0 + this.mercy * 1.5); g.hud.banner(COPY.banners.clear, 'small'); g.audio.play('sfx_clear', { vol: 0.9 }); g.audio.setMusicMix({ bed: 1, combat: 0.2 }, 2); if (pl.hp < 50) g.spawnPickup(pl.x + rnd(-3, 3), pl.z + rnd(-3, 3), 'heart'); }
    }
    else if (this.state === 'between' && this.stateT <= 0) this.nextWave();
    else if (this.state === 'breather' && this.stateT <= 0) { this.state = 'boss'; const b = this.get(g.world.THEME.boss); const sp = g.world.env.bossSpawn || { x: 0, z: -14 }; b.spawn(sp.x, sp.z); if (!this.enemies.includes(b)) this.enemies.push(b); this.boss = b; }
    // enemies
    for (const e of this.enemies) if (e.root.visible) e.fixedUpdate(step, pl, this.enemies);
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) { const p = this.pickups[i]; if (!p) continue; p.t -= step; const dx = pl.x - p.x, dz = pl.z - p.z; const d = Math.hypot(dx, dz); if (d < 2.5 && pl.alive) { p.x += dx / d * 12 * step; p.z += dz / d * 12 * step; } p.obj.position.set(p.x, 0.6 + Math.sin(g.time * 3 + p.x) * 0.15, p.z); p.obj.rotation.y += step * 2; if (d < 0.9 && pl.alive) { g.collectPickup(p); this.ctx.scene.remove(p.obj); this.pickups.splice(i, 1); } else if (p.t <= 0) { this.ctx.scene.remove(p.obj); this.pickups.splice(i, 1); } }
    // acid puddles
    for (let i = this.puddles.length - 1; i >= 0; i--) { const p = this.puddles[i]; if (!p) continue; p.t -= step; if (pl.alive && Math.hypot(pl.x - p.x, pl.z - p.z) < p.r) { p.tick -= step; if (p.tick <= 0) { p.tick = 0.5; pl.hurtSoft(2.5); } } if (p.t <= 0) this.puddles.splice(i, 1); }
  }
  update(dt, alpha) { for (const e of this.enemies) if (e.root.visible) e.update(dt, alpha); }
  onWake() { // player woke: keep boss phase, reset wave enemies
    this.wakesOnWave++; for (const e of this.enemies) { if (!e.boss) e.despawn(); } this.held.melee.length = 0; this.held.ranged.length = 0;
    if (this.state === 'boss' && this.boss) { const b = this.boss; b.stagger = 0; b.move = null; b.state = 'move'; b.moveCd = 3; b.x = this.game.world.env.bossSpawn?.x || 0; b.z = this.game.world.env.bossSpawn?.z || -12; b.hp = Math.min(b.maxhp * (b.phase === 3 ? 0.33 : b.phase === 2 ? 0.66 : 1) * 0.999, b.hp + b.maxhp * 0.08); b.noHit = false; }
    else { this.queue = []; this.state = 'prewave'; this.stateT = 2.5; this.waveIdx = Math.max(-1, this.waveIdx - 1); }
    for (const p of this.puddles) { } this.puddles.length = 0;
  }
}
