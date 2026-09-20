// Enemies: pooled skinned monsters with AI brains, telegraphs, hit reactions and gore.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { AnimGraph } from '../anim/AnimGraph.js';
import { ENEMIES } from './data/enemies.js';
import { COPY } from './data/copy.js';
import { P } from '../render/particles.js';
import { D } from '../render/decals.js';
import { clamp, lerp, damp, dampAng, angDiff, rnd, pick } from '../core/math.js';
import { patchFog } from '../render/fx.js';

const _v = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const RED = new THREE.Color(0xff2438);

// shared per-type prototype (loaded once per world)
export class EnemyProto {
  constructor(ctx, key) {
    const def = ENEMIES[key]; this.def = def; this.key = key; const gltf = ctx.assets.get(def.glb); this.gltf = gltf; this.clips = gltf.animations;
    this.scene = gltf.scene; this.rigged = false; this.scene.traverse(o => { if (o.isSkinnedMesh) this.rigged = true; });
    // bounds -> auto height scale so the model's height matches def.height
    this.scene.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(this.scene); const h = box.max.y - box.min.y; this.baseScale = def.height / h * (def.scale || 1); this.minY = box.min.y; this.center = box.getCenter(new THREE.Vector3());
    this.materials = []; this.scene.traverse(o => { if (o.isMesh) { const m = o.material; m.roughness = Math.max(0.5, m.roughness ?? 0.7); m.metalness = 0; m.envMapIntensity = 0.35; if (!m.emissive) m.emissive = new THREE.Color(0); if (m.map) m.map.anisotropy = 2; this.materials.push(m); if (!this.rigged) this.patchSwim(m); } });
    this.swimUniform = { value: 0 };
  }
  patchSwim(m) {
    const su = this.swimU = this.swimU || { value: 0 }; const tu = this.timeU = this.timeU || { value: 0 };
    m.onBeforeCompile = sh => { sh.uniforms.uSwim = su; sh.uniforms.uT = tu; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSwim; uniform float uT;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ float z = transformed.z; float w = sin(uT * 7.0 - z * 2.2) * uSwim * (0.35 + max(-z, 0.0) * 0.45); float c = cos(w), s = sin(w); transformed.x = transformed.x * c - z * s * 0.15; }'); };
    m.customProgramCacheKey = () => 'swim';
  }
}

export class Enemy {
  constructor(ctx, proto) {
    this.ctx = ctx; this.game = ctx.game; this.proto = proto; this.def = proto.def; this.key = proto.key; this.alive = false; this.boss = !!this.def.boss;
    this.obj = proto.rigged ? skClone(proto.scene) : proto.scene.clone(true); this.obj.visible = false;
    this.mats = []; this.obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0); o.castShadow = ctx.renderer.tier.shadowCasters !== 'hero'; o.receiveShadow = true; o.frustumCulled = false; this.mats.push(o.material); if (!proto.rigged) { o.material.onBeforeCompile = proto.scene.children[0]?.material?.onBeforeCompile || o.material.onBeforeCompile; proto.patchSwim(o.material); } } });
    this.obj.scale.setScalar(proto.baseScale); this.inner = new THREE.Group(); this.inner.add(this.obj); this.inner.position.y = -proto.minY * proto.baseScale; this.root = new THREE.Group(); this.root.add(this.inner); ctx.scene.add(this.root);
    if (proto.rigged) { this.anim = new AnimGraph(this.obj, proto.clips); this.bones = {}; this.obj.traverse(o => { if (o.isBone) this.bones[o.name] = o; }); }
    this.x = 0; this.z = 0; this.y = 0; this.px = 0; this.pz = 0; this.vx = 0; this.vz = 0; this.face = 0; this.r = this.def.r; this.height = this.def.height; this.headY = this.def.headY; this.state = 'dead';
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })); this.blob.position.y = 0.02; this.blob.scale.setScalar(this.r * 1.6); this.root.add(this.blob);
  }
  spawn(x, z, opts = {}) {
    const d = this.def, g = this.game; const mul = g.hpMul;
    this.alive = true; this.x = x; this.z = z; this.px = x; this.pz = z; this.vx = this.vz = 0; this.hp = Math.ceil(d.hp * mul); this.maxhp = this.hp; this.state = 'emerge'; this.stT = 0; this.windup = 0; this.cd = rnd(0.8, 2); this.token = null; this.iframes = 0; this.noHit = true; this.noLock = false; this.flash = 0; this.hitT = 0; this.stagger = 0; this.legless = false; this.armless = 0; this.headless = false; this.deadT = 0; this.circleDir = Math.random() < 0.5 ? 1 : -1; this.seen = 0; this.orbit = rnd(0, Math.PI * 2); this.alerted = false;
    this.face = Math.atan2(g.player.x - x, g.player.z - z); this.y = d.swim ? rnd(d.swim[0], d.swim[1]) : 0; this.ty = this.y; this.tilt = 0;
    this.root.position.set(x, this.y, z); this.root.rotation.set(0, this.face, 0); this.root.visible = true; this.obj.visible = true; this.inner.position.y = -this.proto.minY * this.proto.baseScale; this.inner.rotation.set(0, 0, 0); this.obj.scale.setScalar(this.proto.baseScale);
    for (const m of this.mats) { m.opacity = 1; m.transparent = false; m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 1; }
    if (this.anim) { this.anim.stopAll(); for (const b in this.bones) this.bones[b].scale.setScalar(1); }
    this.kind = opts.kind || 'ground'; this.emergeT = opts.emerge ?? (this.kind === 'grave' ? 1.6 : this.kind === 'treeline' ? 0.9 : 0.6);
    if (this.kind === 'grave') { this.inner.position.y -= this.height; }
    if (this.kind === 'treeline') { this.inner.position.y += 6; }
    this.blob.visible = !d.swim;
    if (this.anim) this.anim.play(d.clips.idle, 0);
  }
  // ---------- damage ----------
  hurt(dmg, dirx, dirz, head, proj) {
    if (!this.alive || this.noHit) return; const g = this.game; const d = this.def;
    if (this.boss && this.bossIntro) return;
    let mul = 1;
    if (this.boss) { mul *= this.weakOpen ? (head ? 2 : 1) : (this.enraged ? 0.55 : 0.42); } else if (head) mul = 1;
    if (g.player.buffs.vision > 0) mul *= 1.2;
    const amt = Math.round(dmg * mul); this.hp -= amt; this.flash = 0.06; this.hitT = 0.25;
    const kind = head ? 'weak' : 'body'; g.onEnemyHit(this, amt, head, proj);
    if (!this.boss) { const kb = proj && proj.knock ? proj.knock : 0.35; this.x += dirx * kb; this.z += dirz * kb; if (this.hp > 0 && this.stagger <= 0 && this.state !== 'attack' && this.anim) { this.anim.upperShot(d.clips.hit, 0.05, 2); } }
    if (this.boss) { this.stagger = Math.max(this.stagger, 0.05); }
    // sever limbs with bone-saw
    if (proj && proj.sever && d.gore === 'limbs' && this.anim && this.hp > 0 && !this.boss) {
      if (!this.legless && proj.y < this.y + 0.9 && Math.random() < 0.7) this.severLegs(dirx, dirz);
      else if (this.armless < 2 && Math.random() < 0.6) this.severArm(dirx, dirz);
    }
    if (this.hp <= 0) this.die(dirx, dirz, head, proj);
  }
  severLegs(dx, dz) { this.legless = true; this.def2 = { speed: this.def.speed * 0.45 }; for (const n of ['LeftUpLeg', 'RightUpLeg']) this.bones[n] && this.bones[n].scale.setScalar(0.001); this.inner.position.y -= 0.75; this.inner.rotation.x = 1.15; this.height *= 0.55; this.headY = this.height * 0.9; this.game.gore(this, 'limb', dx, dz, 2); this.game.hud.stamp(COPY.stamps.legs, 'red'); this.game.audio.play('sfx_sever', { x: this.x, z: this.z, vol: 1 }); }
  severArm(dx, dz) { this.armless++; const n = this.armless === 1 ? 'LeftArm' : 'RightArm'; this.bones[n] && this.bones[n].scale.setScalar(0.001); this.game.gore(this, 'limb', dx, dz, 1); this.game.audio.play('sfx_sever', { x: this.x, z: this.z, vol: 0.9 }); }
  die(dirx, dirz, head, proj) {
    const g = this.game; this.alive = false; this.state = 'dying'; this.deadT = 0; this.noLock = true; this.releaseToken();
    if (head && this.bones && this.bones.Head) { this.bones.Head.scale.setScalar(0.001); this.headless = true; }
    g.onEnemyKill(this, head, dirx, dirz, proj);
    if (this.anim) { const clip = this.def.clips.death; this.anim.shot(clip, null, 0.05, { hold: true, timeScale: 1.4 }); }
    else { this.tumble = 1; }
    this.vx = dirx * 2.5; this.vz = dirz * 2.5; this.blob.visible = false;
  }
  releaseToken() { if (this.token) { this.game.director.release(this.token, this); this.token = null; } }
  despawn() { this.alive = false; this.root.visible = false; this.obj.visible = false; this.state = 'dead'; this.releaseToken(); if (this.decal !== undefined && this.decal !== null) { this.ctx.decals.kill(this.decal); this.decal = null; } if (this.anim) this.anim.stopAll(); }
  // ---------- fixed step ----------
  fixedUpdate(step, player, enemies) {
    const g = this.game, d = this.def; this.px = this.x; this.pz = this.z;
    if (this.flash > 0) this.flash -= step; if (this.hitT > 0) this.hitT -= step; if (this.iframes > 0) this.iframes -= step;
    if (this.state === 'dying') { this.deadT += step; this.vx *= 0.9; this.vz *= 0.9; this.x += this.vx * step; this.z += this.vz * step; if (this.def.swim) { this.y += step * (this.tumble ? -1.2 : -0.6); } if (this.deadT > (this.boss ? 6 : 10)) { const sink = this.deadT - (this.boss ? 6 : 10); this.inner.position.y -= step * 0.6; if (sink > 2) this.despawn(); } return; }
    if (!this.alive) return;
    if (this.state === 'emerge') { this.stT += step; const u = clamp(this.stT / this.emergeT, 0, 1); if (this.kind === 'grave') { this.inner.position.y = -this.proto.minY * this.proto.baseScale - this.height * (1 - u); if (Math.random() < 0.5) this.ctx.particlesAlpha.one(this.x + rnd(-.6, .6), 0.1, this.z + rnd(-.6, .6), { type: P.CHUNK, color: _c.set(0x2a2016), life: 0.8, size: 0.12, vx: rnd(-1, 1), vy: rnd(2, 4), vz: rnd(-1, 1), gravity: 9 }); } else if (this.kind === 'treeline') { this.inner.position.y = -this.proto.minY * this.proto.baseScale + 6 * (1 - u) * (1 - u); } if (u > 0.62 && this.noHit) { this.noHit = false; this.noLock = false; }
      if (u >= 1) { this.state = 'move'; this.noHit = false; this.noLock = false; this.stT = 0; if (this.kind === 'treeline') { g.shake(0.25); g.audio.play('sfx_thud', { x: this.x, z: this.z, vol: 0.8 }); this.ctx.particlesAlpha.burst(this.x, 0.1, this.z, { n: 10, type: P.SMOKE, color: _c.set(0x1a1612), speed: 1.5, life: 0.6, size: 0.5, sizeEnd: 1.2 }); } if (this.anim && d.clips.scream && Math.random() < 0.5) { this.anim.shot(d.clips.scream, null, 0.1, { timeScale: 1.8 }); g.audio.play('sfx_' + d.voice + '_scream', { x: this.x, z: this.z, vol: 0.9, vary: 0.12 }); this.state = 'scream'; this.stT = 0; } } return; }
    if (this.stagger > 0) { this.stagger -= step; this.vx *= 0.85; this.vz *= 0.85; this.x += this.vx * step; this.z += this.vz * step; return; }
    if (this.state === 'scream') { this.stT += step; if (this.stT > 1.2) this.state = 'move'; return; }
    const dx = player.x - this.x, dz = player.z - this.z; const dist = Math.hypot(dx, dz) || 1; const nx = dx / dist, nz = dz / dist;
    const brain = BRAINS[d.ai]; if (brain) brain(this, step, player, dist, nx, nz, g);
    // separation from other enemies
    for (const o of enemies) { if (o === this || !o.alive || o.state === 'emerge') continue; const ox = this.x - o.x, oz = this.z - o.z; const od = Math.hypot(ox, oz); const min = this.r + o.r + 0.2; if (od < min && od > 1e-3) { const push = (min - od) * 0.5; this.x += ox / od * push; this.z += oz / od * push; } }
    // player separation (no clipping into Knox)
    { const min = this.r + player.r + 0.5; if (dist < min && this.state !== 'lunge') { this.x = player.x - nx * min; this.z = player.z - nz * min; } }
    // bounds + obstacles
    const R = g.world.THEME.radius + (this.boss ? 1 : -0.3); const dd = Math.hypot(this.x, this.z); if (dd > R) { this.x *= R / dd; this.z *= R / dd; }
    if (!d.swim && g.world.env.obstacles) for (const o of g.world.env.obstacles) { const ox = this.x - o.x, oz = this.z - o.z; const od = Math.hypot(ox, oz); const min = o.r + this.r * 0.6; if (od < min && od > 1e-4) { this.x = o.x + ox / od * min; this.z = o.z + oz / od * min; } }
    // swim height
    if (d.swim) { this.y = damp(this.y, this.ty, 2, step); }
  }
  // helpers for brains
  moveToward(tx, tz, speed, step) { const dx = tx - this.x, dz = tz - this.z; const d = Math.hypot(dx, dz) || 1; this.vx = dx / d * speed; this.vz = dz / d * speed; this.x += this.vx * step; this.z += this.vz * step; this.faceTo(this.vx, this.vz, step, 8); }
  faceTo(dx, dz, step, k = 10) { if (Math.abs(dx) + Math.abs(dz) < 1e-4) return; this.face = dampAng(this.face, Math.atan2(dx, dz), k, step); }
  // ---------- per frame ----------
  update(dt, alpha) {
    const g = this.game; if (!this.root.visible) return;
    this.root.position.x = lerp(this.px, this.x, alpha); this.root.position.z = lerp(this.pz, this.z, alpha); this.root.position.y = this.y; this.root.rotation.y = this.face;
    if (this.def.swim) { const sp = Math.hypot(this.vx, this.vz); this.root.rotation.z = damp(this.root.rotation.z, -this.turnRate * 0.35 || 0, 4, dt); this.root.rotation.x = damp(this.root.rotation.x, this.state === 'dying' ? (this.tumble ? Math.PI : 0) : -(this.ty - this.y) * 0.3, 3, dt); if (this.proto.swimU) { this.proto.swimU.value = clamp(0.15 + sp * 0.06, 0.15, 0.9); this.proto.timeU.value = g.time; } }
    if (this.anim) {
      const d = this.def; if (this.alive && this.state !== 'emerge' && this.state !== 'scream' && this.state !== 'attack' && this.state !== 'lunge' && this.state !== 'windup' && this.state !== 'dying') {
        const sp = Math.hypot(this.vx, this.vz); const clip = this.state === 'rush' ? d.clips.rush || d.clips.move : d.clips.move;
        if (sp > 0.3) { this.anim.play(clip, 0.2); const a = this.anim.current; if (a) a.setEffectiveTimeScale((this.state === 'rush' ? (d.rushClipSpeed || 1) : (d.moveClipSpeed || 1)) * clamp(sp / (this.state === 'rush' ? (d.sprint || d.speed) : d.speed), 0.6, 1.6)); }
        else this.anim.play(d.clips.idle, 0.3);
      }
      this.anim.update(dt);
    }
    // flash / tint
    const f = this.flash > 0 ? (this.boss ? 0.35 : 0.8) : 0; const vision = g.player.buffs.vision > 0; for (const m of this.mats) { if (f) m.emissive.setRGB(f, f, f); else if (vision) m.emissive.setRGB(0.8, 0.05, 0.05); else if (this.windup > 0) { const p = (Math.sin(g.time * 50) * 0.5 + 0.5) * 0.7; m.emissive.setRGB(p, p * 0.1, p * 0.05); } else if (this.boss && this.weakOpen) { m.emissive.setRGB(0.6, 0.1, 0.0); } else m.emissive.setRGB(0, 0, 0); }
  }
}

// ---------- AI brains (fixed step) ----------
function attackCone(e, player, range, cone, dmg, g) { const dx = player.x - e.x, dz = player.z - e.z; const dist = Math.hypot(dx, dz); if (dist > range + player.r) return false; const ang = Math.abs(angDiff(e.face, Math.atan2(dx, dz))); if (ang > cone * Math.PI / 360) return false; return player.hurt(dmg, dx / (dist || 1), dz / (dist || 1), e.key); }
function telegraphCone(e, g, range, cone) { const col = _c.set(RED); e.decal = g.decals.add(e.x + Math.sin(e.face) * range * 0.5, e.z + Math.cos(e.face) * range * 0.5, { type: D.CONE, size: range * 2.1, rot: -e.face + Math.PI, color: col, life: e.def.attack.windup + 0.15, alpha: 0.55, fadeIn: 0.15 }); }
function meleeWindup(e, step, player, dist, nx, nz, g, clipKey = 'attack') {
  const A = e.def.attack; e.windup -= step;
  // track the player early, then commit: the last 40% of the windup is dodgeable because the cone stops following
  if (e.windup > A.windup * 0.4) { e.faceTo(nx, nz, step, 6); if (e.decal != null) g.decals.move(e.decal, e.x + Math.sin(e.face) * (A.range + 0.6) * 0.5, e.z + Math.cos(e.face) * (A.range + 0.6) * 0.5, -e.face + Math.PI); }
  if (e.windup <= 0) { e.state = 'attack'; e.stT = 0; e.noWind = true; const hit = attackCone(e, player, A.range + 0.4, A.cone || 90, A.dmg, g); g.audio.play('sfx_' + e.def.voice + '_swing', { x: e.x, z: e.z, vol: 0.9, vary: 0.1 }); g.shake(hit ? 0.3 : 0.1); if (e.decal != null) { g.decals.kill(e.decal); e.decal = null; } }
}
function startWindup(e, g, clip, scale = 1.0) { e.state = 'windup'; e.windup = e.def.attack.windup; e.vx = e.vz = 0; if (e.anim) { const a = e.anim.shot(clip, null, 0.05, { timeScale: scale }); } g.audio.play('sfx_' + e.def.voice + '_windup', { x: e.x, z: e.z, vol: 0.8, vary: 0.1 }); }

export const BRAINS = {
  // Skinwalker stalker: freezes when watched (creepy), rushes when not; claw swipe with cone telegraph
  stalker(e, step, player, dist, nx, nz, g) {
    const d = e.def, A = d.attack; e.cd -= step;
    if (e.state === 'windup') { meleeWindup(e, step, player, dist, nx, nz, g); return; }
    if (e.state === 'attack') { e.stT += step; if (e.stT > 0.9) { e.state = 'move'; e.cd = rnd(1.4, 2.6); e.releaseToken(); } return; }
    const watched = g.isOnScreen(e) && dist > 5 && e.hitT <= 0; e.seen = watched ? e.seen + step : 0;
    e.burstT = (e.burstT ?? 0) - step; e.burstCd = (e.burstCd ?? 0) - step;
    if (watched && e.seen > 0.4 && e.seen < 2.6 && dist > 7) { e.vx = e.vz = 0; e.faceTo(nx, nz, step, 4); e.state = 'move'; return; } // stands still while looked at
    if (dist <= A.range && e.cd <= 0 && (e.token || (e.token = g.director.request('melee', e)))) { startWindup(e, g, d.clips.attack, 3.5 / A.windup * 0.3); telegraphCone(e, g, A.range + 0.6, A.cone); return; }
    const rush = !watched || dist < 7 || e.seen > 2.6; e.state = rush ? 'rush' : 'move';
    if (rush && e.burstT <= 0 && e.burstCd <= 0 && dist > 4 && dist < 16) { e.burstT = 1.0; e.burstCd = 2.6; }
    const sp = rush ? (e.burstT > 0 ? d.sprint : d.sprint * 0.62) : d.speed;
    if (e.token || dist > 3.5) { e.moveToward(player.x, player.z, sp, step); }
    else { // no token: circle at 3.5–4 m and posture
      e.orbit += step * 0.6 * e.circleDir; const tx = player.x - Math.sin(e.orbit) * 3.8, tz = player.z - Math.cos(e.orbit) * 3.8; e.moveToward(tx, tz, d.speed * 0.8, step); e.faceTo(nx, nz, step, 6);
      if (e.cd <= 0 && (e.token = g.director.request('melee', e))) e.cd = 0.2;
    }
  },
  // Crawler: circles, then pounces along a line
  pouncer(e, step, player, dist, nx, nz, g) {
    const d = e.def, A = d.attack; e.cd -= step;
    if (e.state === 'windup') { e.windup -= step; if (e.windup > A.windup * 0.4) { e.faceTo(nx, nz, step, 8); if (e.decal != null) g.decals.move(e.decal, e.x + Math.sin(e.face) * A.range * 0.5, e.z + Math.cos(e.face) * A.range * 0.5, -e.face); } if (e.windup <= 0) { e.state = 'lunge'; e.stT = 0; e.lx = Math.sin(e.face); e.lz = Math.cos(e.face); e.hitDone = false; g.audio.play('sfx_crawler_screech', { x: e.x, z: e.z, vol: 0.9 }); if (e.decal != null) { g.decals.kill(e.decal); e.decal = null; } } return; }
    if (e.state === 'lunge') { e.stT += step; const sp = A.lunge; e.vx = e.lx * sp; e.vz = e.lz * sp; e.x += e.vx * step; e.z += e.vz * step; e.inner.position.y = -e.proto.minY * e.proto.baseScale + Math.sin(clamp(e.stT / 0.5, 0, 1) * Math.PI) * 1.2; if (!e.hitDone && Math.hypot(player.x - e.x, player.z - e.z) < e.r + player.r + 0.3) { e.hitDone = true; player.hurt(A.dmg, e.lx, e.lz, e.key); } if (e.stT > 0.5) { e.state = 'stun'; e.stT = 0; e.inner.position.y = -e.proto.minY * e.proto.baseScale; e.vx = e.vz = 0; e.releaseToken(); } return; }
    if (e.state === 'stun') { e.stT += step; if (e.stT > 0.6) { e.state = 'move'; e.cd = rnd(1.5, 2.5); } return; }
    if (dist < A.range && dist > 2 && e.cd <= 0 && (e.token || (e.token = g.director.request('melee', e)))) { startWindup(e, g, d.clips.attack, 2.37 / A.windup * 0.35); const col = _c.set(RED); e.decal = g.decals.add(e.x + nx * A.range * 0.5, e.z + nz * A.range * 0.5, { type: D.LINE, size: A.range * 1.05, rot: -Math.atan2(nx, nz), color: col, life: A.windup + 0.1, alpha: 0.5, fadeIn: 0.1 }); return; }
    e.orbit += step * 1.1 * e.circleDir; const rr = 4.5; const tx = player.x - Math.sin(e.orbit) * rr, tz = player.z - Math.cos(e.orbit) * rr; e.state = 'rush'; e.moveToward(dist > 7 ? player.x : tx, dist > 7 ? player.z : tz, d.speed, step); if (dist < 6) e.faceTo(nx, nz, step, 6);
  },
  // Rotter: relentless shamble, lunge-grab with cone
  shambler(e, step, player, dist, nx, nz, g) {
    const d = e.def, A = d.attack; e.cd -= step; const speed = e.legless ? d.speed * 0.45 : d.speed;
    if (e.state === 'windup') { meleeWindup(e, step, player, dist, nx, nz, g); return; }
    if (e.state === 'attack') { e.stT += step; if (e.stT > 1.0) { e.state = 'move'; e.cd = rnd(1.0, 2.0); e.releaseToken(); } return; }
    if (dist <= A.range && e.cd <= 0 && (e.token || (e.token = g.director.request('melee', e)))) { startWindup(e, g, d.clips.attack, 2.83 / A.windup * 0.3); telegraphCone(e, g, A.range + 0.5, A.cone); return; }
    if (e.token || dist > 3) { const rush = dist < 5 && dist > A.range && !e.legless; e.state = rush ? 'rush' : 'move'; e.moveToward(player.x, player.z, rush ? d.sprint : speed, step); }
    else { e.orbit += step * 0.4 * e.circleDir; e.moveToward(player.x - Math.sin(e.orbit) * 3.2, player.z - Math.cos(e.orbit) * 3.2, speed, step); e.faceTo(nx, nz, step, 6); if (e.cd <= 0 && (e.token = g.director.request('melee', e))) e.cd = 0.2; }
  },
  // Bloater: keeps 8–12 m, lobs bile that leaves acid puddles
  spitter(e, step, player, dist, nx, nz, g) {
    const d = e.def, A = d.attack; e.cd -= step;
    if (e.state === 'windup') { e.windup -= step; e.faceTo(nx, nz, step, 6); if (e.windup <= 0) { e.state = 'move'; e.cd = A.cooldown; e.releaseToken(); const tx = player.x + player.vx * 0.6, tz = player.z + player.vz * 0.6; const dx = tx - e.x, dz = tz - e.z; const dd = Math.hypot(dx, dz) || 1; const T = 1.1; g.projectiles.fireEnemy({ x: e.x, y: e.y + e.height * 0.7, z: e.z, vx: dx / T, vy: 4.5 + e.height * 0.7 / T, vz: dz / T, life: 3, dmg: A.dmg, gravity: 9, color: 0x6aff2a, puddle: A.puddle, r: 0.45 }); g.audio.play('sfx_bloater_spit', { x: e.x, z: e.z, vol: 0.9 }); if (e.decal != null) { g.decals.kill(e.decal); e.decal = null; } } return; }
    if (dist < A.range && e.cd <= 0 && (e.token || (e.token = g.director.request('ranged', e)))) { startWindup(e, g, d.clips.attack, 3.5 / A.windup * 0.3); const tx = player.x + player.vx * 0.6, tz = player.z + player.vz * 0.6; e.decal = g.decals.add(tx, tz, { type: D.RING, size: A.puddle * 2.2, color: _c.set(0x8aff3a), life: A.windup + 1.2, alpha: 0.6, fadeIn: 0.2 }); return; }
    e.state = 'move'; if (dist > 11) e.moveToward(player.x, player.z, d.speed, step); else if (dist < 7) e.moveToward(e.x - nx * 3, e.z - nz * 3, d.speed, step); else { e.faceTo(nx, nz, step, 4); e.vx = e.vz = 0; }
  },
  // Reaper shark: circles outside the light, then rushes along a telegraphed line
  charger(e, step, player, dist, nx, nz, g) {
    const d = e.def, A = d.attack; e.cd -= step; const prevFace = e.face;
    if (e.state === 'windup') { e.windup -= step; if (e.windup > A.windup * 0.4) { e.faceTo(nx, nz, step, 5); if (e.decal != null) g.decals.move(e.decal, e.x + Math.sin(e.face) * A.range * 0.5, e.z + Math.cos(e.face) * A.range * 0.5, -e.face); } e.ty = 1.0; if (e.windup <= 0) { e.state = 'lunge'; e.stT = 0; e.lx = Math.sin(e.face); e.lz = Math.cos(e.face); e.hitDone = false; g.audio.play('sfx_shark_rush', { x: e.x, z: e.z, vol: 1 }); if (e.decal != null) { g.decals.kill(e.decal); e.decal = null; } } e.turnRate = 0; return; }
    if (e.state === 'lunge') { e.stT += step; const sp = d.sprint; e.vx = e.lx * sp; e.vz = e.lz * sp; e.x += e.vx * step; e.z += e.vz * step; e.ty = 0.9; if (!e.hitDone && Math.hypot(player.x - e.x, player.z - e.z) < e.r + player.r + 0.4) { e.hitDone = true; if (player.hurt(A.dmg, e.lx, e.lz, e.key)) { g.audio.play('sfx_shark_bite', { vol: 1 }); g.bloodScreen(); } } if (Math.random() < 0.6) e.ctx.particlesAdd.one(e.x, e.y + 0.5, e.z, { type: P.BUBBLE, color: _c.set(0xbfe8ff), life: 1.2, size: 0.15, sizeEnd: 0.3, vx: rnd(-1, 1), vy: 1.5, vz: rnd(-1, 1) }); if (e.stT > 1.1) { e.state = 'move'; e.cd = rnd(2.2, 3.4); e.releaseToken(); e.ty = rnd(d.swim[0], d.swim[1]); } e.turnRate = 0; return; }
    if (dist < A.range && dist > 4 && e.cd <= 0 && (e.token || (e.token = g.director.request('melee', e)))) { startWindup(e, g, null); e.windup = A.windup; e.decal = g.decals.add(e.x + nx * A.range * 0.5, e.z + nz * A.range * 0.5, { type: D.LINE, size: A.range * 1.05, rot: -Math.atan2(nx, nz), color: _c.set(RED), life: A.windup + 0.1, alpha: 0.5, fadeIn: 0.1 }); g.audio.play('sfx_shark_windup', { x: e.x, z: e.z, vol: 0.9 }); return; }
    e.orbit += step * 0.55 * e.circleDir; const rr = 9 + Math.sin(e.orbit * 2) * 1.5; e.state = 'move'; const tx = player.x - Math.sin(e.orbit) * rr, tz = player.z - Math.cos(e.orbit) * rr; e.moveToward(tx, tz, d.speed, step); e.turnRate = angDiff(prevFace, e.face) / step;
  },
  // Lantern jelly: drifts toward the player, shock ring
  drift(e, step, player, dist, nx, nz, g) {
    const d = e.def, A = d.attack; e.cd -= step;
    if (e.state === 'windup') { e.windup -= step; if (e.windup <= 0) { e.state = 'move'; e.cd = A.cooldown; e.releaseToken(); if (dist < A.range + player.r) player.hurt(A.dmg, nx, nz, e.key); g.audio.play('sfx_jelly_zap', { x: e.x, z: e.z, vol: 1 }); e.ctx.particlesAdd.one(e.x, 0.3, e.z, { type: P.RING, color: _c.set(0xd060ff), life: 0.4, size: 1, sizeEnd: A.range * 2.2, vx: 0, vy: 0, vz: 0 }); e.ctx.particlesAdd.burst(e.x, e.y, e.z, { n: 24, type: P.SPARK, color: _c.set(0xe0a0ff), speed: 6, life: 0.4, size: 0.15, stretch: 0.8 }); if (e.decal != null) { g.decals.kill(e.decal); e.decal = null; } } return; }
    if (dist < A.range && e.cd <= 0 && (e.token || (e.token = g.director.request('ranged', e)))) { e.state = 'windup'; e.windup = A.windup; e.vx = e.vz = 0; e.decal = g.decals.add(e.x, e.z, { type: D.RING, size: A.range * 2.2, color: _c.set(0xd060ff), life: A.windup + 0.1, alpha: 0.6, fadeIn: 0.15 }); g.audio.play('sfx_jelly_charge', { x: e.x, z: e.z, vol: 0.8 }); return; }
    e.state = 'move'; e.moveToward(player.x, player.z, d.speed, step); e.ty = d.swim[0] + Math.sin(g.time * 0.7 + e.orbit) * 0.8 + 1;
  },
};
