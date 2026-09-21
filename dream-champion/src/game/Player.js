// Knox: locomotion, roll, Dream Blaster, aim assist, ult, damage, animation graph, hero gear, over-shoulder camera.
import * as THREE from 'three';
import { clamp, lerp, damp, angDiff, dampAng, rnd } from '../core/math.js';
import { AnimGraph } from '../anim/AnimGraph.js';
import { HeroGear } from './HeroGear.js';
import { P } from '../render/particles.js';
import { AMMO } from './data/enemies.js';
import { COPY } from './data/copy.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ROLL = { dur: 0.45, dist: 4.5, iStart: 0.04, iEnd: 0.30, charges: 2, refill: 1.8 };
const _near = [];            // scratch broadphase list for the obstacle solver (no per-step allocation)
const SKIN = 0.02;           // rest this far proud of a surface so the next step starts outside it
// Camera occlusion: how much of a prop's own radius counts as "across the sightline" (a graze that only
// clips his shoulder is not worth yanking the lens in for), and how close the lens may ever come. 2.4 m
// rather than 1.5: in THE GRAVE, dropping the floor to 1.5 put the lens inside 2.4 m on 49% of frames for
// an extra 0.2 points of visibility, which is a bad trade in a world that dense.
const CAM_GRAZE = 0.10, CAM_MIN = 2.4;

export class Player {
  constructor(ctx) {
    this.ctx = ctx; this.game = ctx.game; this.alive = true; this.r = 0.42; this.height = 1.5;
    this.x = 0; this.z = 0; this.y = 0; this.px = 0; this.pz = 0; this.vx = 0; this.vz = 0; this.yaw = 0; this.faceYaw = 0; this.speedN = 0;
    this.hp = 100; this.maxhp = 100; this.iframes = 0; this.hurtT = 0; this.dead = false;
    this.ult = 0; this.ultActive = 0; this.combo = 1; this.comboT = 0; this.kills = 0; this.headshots = 0; this.bestStreak = 1;
    this.roll = { t: -1, dirx: 0, dirz: 0, charges: ROLL.charges, refill: 0, buffered: false, perfect: false };
    this.fireCd = 0; this.aimW = 0; this.aimT = 0; this.combatT = 0; this.chargeT = 0; this.charging = false; this.locked = null; this.lockT = 0; this.tapLock = 0;
    this.cam = { yaw: Math.PI, pitch: -0.17, dist: 5.0, targetDist: 5.0, fov: 50, pos: new THREE.Vector3(), lookAt: new THREE.Vector3(), shoulder: 0.55, side: 1, autoT: 0, sway: 0, fovKick: 0 };   // fovKick MUST start at 0: undefined made the fov expression NaN, so the camera silently kept whatever fov the title/cine camera left behind (38deg) until the first shot
    this.idleT = 0;   // seconds since the stick was released; gates the camera easing round behind him
    this.shakeT = 0; this.trauma = 0; this.buffs = { overcharge: 0, vision: 0, quick: 0, shield: 0 };
    this.ammoKey = 'starfire'; this.ammo = AMMO.starfire; this.swim = false; this.bob = 0; this.footT = 0; this.lampOn = true;
    this.root = new THREE.Group(); ctx.scene.add(this.root); this.visible = true;
    this._build();
  }
  _build() {
    const gltf = this.ctx.assets.get('knox'); const src = gltf.scene; this.model = src; this.root.add(src);
    let scan = null; src.traverse(o => { if (o.isSkinnedMesh) scan = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.scan = scan; const mat = scan.material; mat.roughness = 0.82; mat.metalness = 0; mat.envMapIntensity = 0.5; if (mat.map) mat.map.anisotropy = 4; mat.emissive = new THREE.Color(0); this.mat = mat;
    // The scan is an OPEN shell: 448 boundary edges in 9 loops, including a ~0.55 m seam down each side of the
    // torso where the arms were cut off (HeroGear covers them) and a ~0.37 m opening at the hips. Rendered
    // single-sided, every camera angle that sees into one of those openings shows the world straight through
    // Knox -- measured at 1.2-9.2% of his silhouette across a 12-point yaw sweep. Draw him double-sided so a
    // backface fills the hole instead. (Knox is ~26k tris; he is already drawn twice for the shadow map.)
    mat.side = THREE.DoubleSide; mat.shadowSide = THREE.BackSide;   // keep the pre-existing single-sided shadow pass
    // scale so Knox is ~1.5 m (the scan is 1.7 m)
    src.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(scan); const h = box.max.y - box.min.y; const s = 1.5 / h; src.scale.setScalar(s); src.position.y = -box.min.y * s; src.updateMatrixWorld(true);
    this.gear = new HeroGear(scan, 0x4de3ff);
    this.anim = new AnimGraph(src, gltf.animations); this.anim.play('idle', 0);
    // fit blaster on the two-handed rifle pose
    const fit = this.anim.action('run_gun'); fit.setEffectiveWeight(1); this.anim.mixer.update(0.2); src.updateMatrixWorld(true); this.gear.fitBlaster(); fit.setEffectiveWeight(0); this.anim.mixer.setTime(0);
    this.bones = {}; for (const b of scan.skeleton.bones) this.bones[b.name] = b;
    this.muzzleW = new THREE.Vector3(); this.blasterDirW = new THREE.Vector3(0, 0, 1);
  }
  setWorld(theme) {
    this.swim = !!theme.underwater; this.ammoKey = theme.ammo; this.ammo = AMMO[theme.ammo]; this.gear.blaster.glowMat.emissive.set(this.ammo.color); this.gear.blaster.glowMat.color.set(this.ammo.color);
    this.hp = this.maxhp; this.ult = 0; this.combo = 1; this.comboT = 0; this.alive = true; this.dead = false; this.roll.charges = ROLL.charges; this.iframes = 0; this.buffs = { overcharge: 0, vision: 0, quick: 0, shield: 0 };
    this.x = 0; this.z = 4; this.vx = this.vz = 0; this.yaw = Math.PI; this.faceYaw = Math.PI; this.cam.yaw = Math.PI; this.cam.pitch = -0.17; this.cam.init = false; this.cam.occl = undefined; this.locked = null; this.idleT = 0;
    this.anim.stopAll(); this.anim.play(this.swim ? 'swim_idle' : 'combat_idle', 0); this.root.visible = true; this.combatT = 0;
    this.y = this.swim ? 0.35 : 0;
  }
  // ---------- fixed step ----------
  fixedUpdate(step, inp, enemies) {
    const g = this.game; if (!this.alive) return;
    this.px = this.x; this.pz = this.z;
    // timers
    if (this.iframes > 0) this.iframes -= step; if (this.hurtT > 0) this.hurtT -= step; if (this.fireCd > 0) this.fireCd -= step; if (this.comboT > 0) { this.comboT -= step; if (this.comboT <= 0) this.breakCombo(); }
    for (const k in this.buffs) if (this.buffs[k] > 0) this.buffs[k] -= step;
    if (this.roll.charges < ROLL.charges) { this.roll.refill += step * (this.buffs.quick > 0 ? 6 : 1); if (this.roll.refill >= ROLL.refill) { this.roll.refill = 0; this.roll.charges++; } }
    this.ult = Math.min(100, this.ult + 1.5 * step);
    // camera look input
    const look = g.save.data.settings.look || 1; const yawIn = inp.ldx * 0.0028 * look, pitchIn = inp.ldy * 0.0022 * look;
    const friction = this.locked ? (this.lockAng < 3 * Math.PI / 180 ? 0.4 : this.lockAng < 6 * Math.PI / 180 ? 0.55 : 1) : 1;
    this.cam.yaw -= yawIn * friction; this.cam.pitch = clamp(this.cam.pitch - pitchIn * friction, this.swim ? -1.1 : -0.95, this.swim ? 0.9 : 0.42);
    const looking = Math.abs(inp.ldx) + Math.abs(inp.ldy) > 0.5; if (looking) this.cam.autoT = 0.5; else this.cam.autoT -= step;
    // Movement: LIVE camera-relative, every frame. The direction under the thumb is that direction on screen,
    // right now, with no history. The previous version froze the mapping for the duration of a push so the
    // camera could swing without dragging the controls round with it -- but that made the mapping stale by
    // however far the camera had travelled: measured mid-hold after a 179deg swing, thumb-UP drove Knox 3.01 m
    // BACKWARDS. Staleness is not an acceptable price, so the camera gives way instead (see the follow below).
    let mx = inp.mx, my = inp.my; let ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    const moving = ml > 0.05;
    const cy = this.cam.yaw; const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    const wantX = fx * my + rx * mx, wantZ = fz * my + rz * mx;
    const maxSp = (this.swim ? 5.6 : 6.4) * (this.buffs.quick > 0 ? 1.15 : 1);
    // roll
    const R = this.roll;
    if (inp.dash && (R.t < 0 || R.t >= 0.38) && R.charges > 0) { this.startRoll(wantX, wantZ, moving); this.ctx.input.consumeDash(); }
    if (R.t >= 0) {
      R.t += step; const u = clamp(R.t / ROLL.dur, 0, 1); const sp = ROLL.dist / ROLL.dur * (1.8 * (1 - u) + 0.2); // ease-out
      this.vx = R.dirx * sp; this.vz = R.dirz * sp; if (R.t >= ROLL.dur) { R.t = -1; }
      if (this.buffs.quick > 0 && Math.random() < 0.6) this.ctx.particlesAdd.one(this.x, 0.8, this.z, { type: P.DOT, color: new THREE.Color(0x4de3ff), life: 0.35, size: 0.9, sizeEnd: 0.2, vx: 0, vy: 0, vz: 0 });
    } else {
      // NOTE: |want| already equals the stick magnitude — multiplying by ml again squared the response
      // (half a stick push gave a quarter of the speed). Target speed must be linear in stick tilt.
      const acc = moving ? 1 - Math.exp(-step / 0.065) : 1 - Math.exp(-step / 0.07);
      this.vx = lerp(this.vx, wantX * maxSp, acc); this.vz = lerp(this.vz, wantZ * maxSp, acc);
    }
    this.x += this.vx * step; this.z += this.vz * step;
    // Arena bounds + props, solved as a CONSTRAINT SET rather than one pass per prop in list order. THE
    // DROWN scatters coral only 1.6 m apart while two inflated radii can sum to 2.3 m, so neighbouring
    // circles overlap: pushing him clear of A shoved him into B, and the step ended with him up to 0.31 m
    // INSIDE something on 130 of 2340 measured approaches. That residue is the wedge -- the next step
    // starts embedded and the push fires again in the other direction. The skin leaves him a hair proud of
    // the surface so the next step starts clean.
    // Velocity is deliberately NOT projected onto the contact plane. It is the obvious thing to add and it
    // measurably makes sliding WORSE: the normal of a 0.6 m coral swings ~0.08 rad per step while he slides
    // round it, so every step throws away a slice of the tangential speed the previous one earned -- in
    // contact at 80deg off the normal it cost 13% of the slide (2.86 m/s against 3.30 m/s unprojected).
    const world = g.world; const rad = world.THEME.radius; const obs = world.env.obstacles;
    if (obs && obs.length) {
      _near.length = 0;   // broadphase once: the solver then loops over 0-3 circles, not all 48
      for (let i = 0; i < obs.length; i++) { const o = obs[i]; const reach = o.r + this.r + 1; if (Math.abs(this.x - o.x) < reach && Math.abs(this.z - o.z) < reach) _near.push(o); }
      for (let it = 0; it < 8 && _near.length; it++) {
        const dc = Math.hypot(this.x, this.z); if (dc > rad) { this.x *= rad / dc; this.z *= rad / dc; }
        let worst = 0;
        // Gauss-Seidel: apply each violated constraint against the position the previous one left, and
        // sweep again until nothing is violated. Correcting only the deepest per sweep ping-pongs in a
        // notch and still left 19 of 2340 approaches embedded after six sweeps.
        for (let i = 0; i < _near.length; i++) {
          const o = _near[i]; const dx = this.x - o.x, dz = this.z - o.z; const min = o.r + this.r + SKIN; const qq = dx * dx + dz * dz;
          if (qq >= min * min) continue;
          const dd = Math.sqrt(qq); const depth = min - dd; if (depth > worst) worst = depth;
          // dead centre has no outward direction; shove him the way he is facing rather than NaN
          const nx = dd > 1e-4 ? dx / dd : Math.sin(this.faceYaw), nz = dd > 1e-4 ? dz / dd : Math.cos(this.faceYaw);
          this.x += nx * depth; this.z += nz * depth;
        }
        if (worst < SKIN * 0.25) break;
      }
    }
    const dr = Math.hypot(this.x, this.z); if (dr > rad) { this.x *= rad / dr; this.z *= rad / dr; }
    // speedN from GROUND COVERED, not from the wish. It used to read the un-collided velocity, so a Knox
    // pinned against a coral with the stick down ran the full-speed run cycle on the spot -- which is what
    // "stuck" looks like on screen even when he is only blocked. It now drives the blend and the footsteps
    // off what actually happened this step.
    this.speedN = Math.min(1.2, Math.hypot(this.x - this.px, this.z - this.pz) / step / maxSp);
    // aim / target
    this.updateLock(step, inp, enemies);
    const wantAim = inp.fire || (this.locked && g.autoBlast) || this.charging; this.aimT = wantAim ? 0.35 : Math.max(0, this.aimT - step);
    const aiming = this.aimT > 0 && R.t < 0; this.aimW = damp(this.aimW, aiming ? 1 : 0, aiming ? 14 : 5, step);
    // facing: toward target when aiming, else move direction, else camera
    //
    // A lock used to pin his body at the enemy unconditionally, which is right while he is shooting and is
    // moon-walking the rest of the time: measured, locked onto a stalker 6 m ahead and pushing the stick
    // straight back, he covered 9.24 m in 1.5 s with his body a full 180deg off his travel direction --
    // "the character will just back up but not actually turn around" in the player's words. So the lock
    // gives his body back once he is CLEARLY running away (>110deg off the bearing) and is not asking to
    // shoot. Auto-blast cannot be the test here: with it on, aimT is high the whole time a lock exists.
    let targetYaw = this.faceYaw;
    const shooting = inp.fire || this.charging;
    let flee = false;
    if (this.locked && moving && !shooting) {
      const bx = this.locked.x - this.x, bz = this.locked.z - this.z; const bl = Math.hypot(bx, bz);
      if (bl > 1e-3) flee = (wantX * bx + wantZ * bz) / (bl * ml) < -0.34;
    }
    if (this.locked && !flee) { targetYaw = Math.atan2(this.locked.x - this.x, this.locked.z - this.z); }
    else if (aiming && !flee) targetYaw = this.cam.yaw; else if (moving) targetYaw = Math.atan2(this.vx, this.vz); else if (R.t >= 0) targetYaw = Math.atan2(R.dirx, R.dirz);
    if (R.t >= 0 && !this.locked) targetYaw = Math.atan2(R.dirx, R.dirz);
    this.faceYaw = dampAng(this.faceYaw, targetYaw, this.locked && !flee ? 22 : 14, step);
    // firing
    let autoOk = false;
    // 45deg = half the horizontal FOV on a phone at the 50deg vertical FOV: auto-blast anything ON SCREEN when it is close, but never
    // shoot at something the player cannot see (50deg was outside the frame edge).
    if (this.locked) { const ld = Math.hypot(this.locked.x - this.x, this.locked.z - this.z); autoOk = ld < 8 ? this.lockAng < 45 * Math.PI / 180 : (ld < 16 && this.lockAng < 20 * Math.PI / 180); }
    const fireHeld = (inp.fire && !this.charging) || (g.autoBlast && (autoOk || this.tapLock > 0) && this.lockT > 0.12 && !inp.fire && !this.charging);
    // charge shot: hold fire with nothing locked (or double-tap via dashQ? no) — releasing fires the charged shot
    if (inp.fire && inp.fireHold >= 0.6 && !this.charging && this.ammo.charge && !this.locked) { this.charging = true; this.chargeT = 0; g.audio.play('sfx_charge', { vol: 0.6 }); }
    if (this.charging) { this.chargeT += step; if (!inp.fire || this.chargeT >= 0.9 || this.locked) { this.fireShot(true); this.charging = false; this.fireCd = 0.35; } }
    else if (fireHeld && this.fireCd <= 0 && (R.t < 0 || R.t >= 0.30)) { this.fireShot(false); this.fireCd = 1 / (this.ammo.rate * (this.buffs.overcharge > 0 ? 1.35 : 1)); }
    if (inp.ult && this.ult >= 100) g.breaker(this);
    this.combatT = enemies.some(e => e.alive) ? 3 : Math.max(0, this.combatT - step);
    // camera follow (fixed for determinism, smoothed in update)
    // Camera follow: ONLY while the stick is up.
    //
    // While a thumb is down the camera holds absolutely still, because under live camera-relative control the
    // stick's own lateral angle IS the gap between the camera and Knox's heading. Any camera that closes that
    // gap therefore turns at a rate set by the stick and never arrives -- holding a diagonal would walk him
    // round a circle, and holding left would eventually make left mean right. There is no clever version of
    // this: follow-while-steering and a stable mapping are the same knob pulled in opposite directions.
    //
    // On release the camera is free, because with no thumb down there is no mapping left to corrupt. That is
    // the turn-around: push the way you want to go, let go, and the view swings round behind him. The window
    // closes after a couple of seconds so it never fights a player who dragged the camera somewhere on purpose.
    this.idleT = moving ? 0 : this.idleT + step;
    if (this.cam.autoT <= 0 && !this.locked && this.idleT > 0.28 && this.idleT < 2.4) {
      let dd = angDiff(this.cam.yaw, this.faceYaw);
      // A dead-straight about-face puts the camera exactly opposite his facing, where "shortest way round" has
      // no answer and the swing can sit on the fence. Pushing straight back IS the natural way to ask to turn
      // around, so bias off the antipode and always commit to a side.
      if (Math.abs(dd) > Math.PI - 1e-3) dd = (dd < 0 ? -1 : 1) * (Math.PI - 1e-3);
      if (Math.abs(dd) > 0.04) this.cam.yaw += clamp(dd * 3.0, -3.0, 3.0) * step;
    }
    // Pull the camera onto the locked enemy. The old 1.6 rad gate meant anything behind Knox was never brought
    // into view, which is exactly the zombie-behind-you case; allow up to 150deg and let it come round.
    // ...and while he is fleeing the lens goes with him rather than being dragged back onto what he is
    // running from -- otherwise his body turns to face his escape and the camera immediately looks away
    // from it again. This cannot run away with itself: the pull's target is a WORLD bearing, and rotating
    // the camera toward it rotates his live heading by the same amount, so the flee angle only ever shrinks.
    if (this.locked && !looking && !flee && this.lockAng < 2.6) { const ty = Math.atan2(this.locked.x - this.x, this.locked.z - this.z); const dd = angDiff(this.cam.yaw, ty); this.cam.yaw += clamp(dd * 1.6, -1.9, 1.9) * step; }
    this.cam.targetDist = (g.bossActive ? 6.0 : 5.0) - (aiming ? 0.7 : 0) + (this.swim ? 0.8 : 0);
    // shield/overcharge visuals
    if (this.buffs.shield > 0 && Math.random() < 0.3) this.ctx.particlesAdd.one(this.x + rnd(-.5, .5), this.y + rnd(0.2, 1.6), this.z + rnd(-.5, .5), { type: P.DOT, color: new THREE.Color(0xffcf4a), life: 0.5, size: 0.15, sizeEnd: 0, vx: 0, vy: 0.4, vz: 0 });
  }
  startRoll(wx, wz, moving) {
    const R = this.roll; let dx = wx, dz = wz; if (!moving) { dx = Math.sin(this.faceYaw); dz = Math.cos(this.faceYaw); } const l = Math.hypot(dx, dz) || 1; R.dirx = dx / l; R.dirz = dz / l; R.t = 0; R.charges--; R.perfect = false; R.refill = 0;
    this.iframes = Math.max(this.iframes, ROLL.iEnd); this.rollIStart = ROLL.iStart;
    this.anim.shot('roll', null, 0.05, { timeScale: 1.87 / ROLL.dur * 0.85 }); this.game.audio.play('sfx_dash', { vol: 0.7, vary: 0.1 });
    this.ctx.particlesAlpha.burst(this.x, 0.1, this.z, { n: 8, type: P.SMOKE, color: new THREE.Color(this.swim ? 0x9fd8ff : 0x2a2622), speed: 1.2, life: 0.5, size: 0.4, sizeEnd: 1.0, up: 0.5 });
    this.cam.fovKick = 1;
  }
  // i-frames active window (roll start offset)
  get invulnerable() { return this.iframes > 0 && (this.roll.t < 0 || this.roll.t >= ROLL.iStart); }
  updateLock(step, inp, enemies) {
    const g = this.game; const cam = this.ctx.camera; this.lockAng = 10;
    if (inp.tap) { // tap-to-target: pick the enemy nearest the tap in screen space
      let best = null, bd = 80; for (const e of enemies) { if (!e.alive) continue; _v.set(e.x, (e.y || 0) + e.height * 0.6, e.z).project(cam); if (_v.z > 1) continue; const sx = (_v.x + 1) / 2 * innerWidth, sy = (1 - _v.y) / 2 * innerHeight; const d = Math.hypot(sx - inp.tap.x, sy - inp.tap.y); if (d < bd) { bd = d; best = e; } }
      if (best) { this.locked = best; this.tapLock = 2; this.lockT = 0.12; }
    }
    const cy = this.cam.yaw; const fx = Math.sin(cy), fz = Math.cos(cy);
    // angle to the current lock: needed by the tap-lock path too (auto-blast gate + camera pull)
    if (this.locked && this.locked.alive) { const dx = this.locked.x - this.x, dz = this.locked.z - this.z; const d = Math.hypot(dx, dz) || 1; this.lockAng = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); }
    if (this.tapLock > 0) { this.tapLock -= step; if (this.locked && this.locked.alive) { this.lockT += step; return; } this.tapLock = 0; }
    let best = null, bs = -1;
    for (const e of enemies) {
      if (!e.alive || e.noLock) continue; const dx = e.x - this.x, dz = e.z - this.z; const d = Math.hypot(dx, dz); if (d > 26 || d < 0.01) continue;
      const ang = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); if (ang > 60 * Math.PI / 180 && d > 3.5) continue;
      const threat = e.windup > 0 ? 1 : d < 3 ? 0.5 : 0; const s = 0.55 * (1 - ang / (30 * Math.PI / 180)) + 0.3 * (1 - d / 26) + 0.15 * threat + (e.boss ? 0.05 : 0);
      if (s > bs) { bs = s; best = e; }
    }
    if (this.locked && (!this.locked.alive || this.locked.noLock)) { this.lockHold = (this.lockHold || 0) + step; if (this.lockHold > 0.15) { this.locked = null; this.lockHold = 0; } }
    else this.lockHold = 0;
    if (best && best !== this.locked) { const cur = this.locked && this.locked.alive ? this.scoreOf(this.locked) : -9; if (bs > cur + 0.15 || !this.locked) { this.locked = best; this.lockT = 0; } }
    if (!best && (!this.locked || !this.locked.alive)) this.locked = null;
    if (this.locked) this.lockT += step;
  }
  scoreOf(e) { const dx = e.x - this.x, dz = e.z - this.z; const d = Math.hypot(dx, dz) || 1; const cy = this.cam.yaw; const ang = Math.acos(clamp((dx * Math.sin(cy) + dz * Math.cos(cy)) / d, -1, 1)); return 0.55 * (1 - ang / (30 * Math.PI / 180)) + 0.3 * (1 - d / 26); }
  aimPoint(out) {
    if (this.locked && this.locked.alive) { const e = this.locked; const lead = Math.hypot(e.x - this.x, e.z - this.z) / this.ammo.speed; const headAim = !e.boss && (e.windup > 0 || e.state === 'scream' || e.state === 'stun' || this.headBias); out.set(e.x + (e.vx || 0) * lead, (e.y || 0) + (e.boss ? e.height * 0.5 : headAim ? (e.headY ?? e.height * 0.9) - 0.05 : e.height * 0.62), e.z + (e.vz || 0) * lead); return out; }
    // camera ray at 30 m
    const cy = this.cam.yaw, cp = this.cam.pitch; out.set(this.x + Math.sin(cy) * Math.cos(cp) * 30, this.y + 1.3 + Math.sin(cp) * 30, this.z + Math.cos(cy) * Math.cos(cp) * 30); return out;
  }
  fireShot(charged) {
    const g = this.game, A = this.ammo; const mz = this.muzzleW; this.headBias = Math.random() < 0.22; const target = this.aimPoint(_v2); this.headBias = false;
    let dx = target.x - mz.x, dy = target.y - mz.y, dz = target.z - mz.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const over = this.buffs.overcharge > 0; const dmgMul = (over ? 2 : 1) * (this.buffs.vision > 0 ? 1.5 : 1);
    const shots = charged && A.charge.spread ? A.charge.spread : (over && A.style === 'bolt' ? 3 : 1);
    for (let i = 0; i < shots; i++) {
      const spread = shots > 1 ? (i - (shots - 1) / 2) * 0.12 : 0; const sx = dx * Math.cos(spread) - dz * Math.sin(spread), sz = dx * Math.sin(spread) + dz * Math.cos(spread);
      g.projectiles.fire({ x: mz.x, y: mz.y, z: mz.z, dx: sx, dy: dy + (A.style === 'disc' ? 0.12 : 0), dz: sz, speed: A.speed * (charged ? 1.2 : 1), life: A.life * (charged ? 1.5 : 1), dmg: (charged ? A.charge.dmg || A.dmg : A.dmg) * dmgMul, head: (charged ? A.charge.dmg || A.head : A.head) * dmgMul, style: A.style, color: over ? 0xff4d4d : A.color, aoe: charged ? (A.charge.aoe || A.aoe || 0) : (A.aoe || 0), homing: A.homing, target: this.locked, pierce: charged && A.charge.pierce, knock: charged ? A.charge.knock : 0, sever: A.sever, charge: charged, bend: 60 });
    }
    // muzzle fx
    const col = new THREE.Color(over ? 0xff4d4d : A.color);
    this.ctx.particlesAdd.burst(mz.x, mz.y, mz.z, { n: charged ? 30 : 8, type: P.SPARK, color: col, color2: new THREE.Color(0xffffff), speed: 6, spread: 0.5, dir: new THREE.Vector3(dx, dy, dz), life: 0.18, size: 0.12, stretch: 0.6 });
    this.ctx.particlesAdd.one(mz.x, mz.y, mz.z, { type: P.STAR, color: col, life: 0.07, size: charged ? 1.6 : 0.75, sizeEnd: 0.2, vx: 0, vy: 0, vz: 0, spin: 20 });
    g.lightFlash(mz.x, mz.y, mz.z, A.light, charged ? 3 : 1.2);
    g.audio.play(charged ? 'sfx_charge_shot' : 'sfx_' + this.ammoKey, { vol: charged ? 1 : 0.8, vary: 0.06, minGap: 0.05 });
    this.kick = charged ? 1 : 0.5; this.trauma = Math.min(1, this.trauma + (charged ? 0.2 : 0.05)); this.recoil = charged ? 2.4 : 1.2;
    this.anim.upperShot('shoot', 0.03, 3.5);
    g.onShot();
  }
  // chip damage (acid, gas): never grants i-frames, never counts as a dodgeable hit
  hurtSoft(dmg) {
    if (!this.alive || this.buffs.shield > 0) return false;
    const g = this.game; this.hp = Math.max(0, this.hp - dmg); this.hurtT = Math.max(this.hurtT, 0.25); g.shake(0.08);
    g.audio.play('sfx_acid_hiss', { x: this.x, z: this.z, vol: 0.5, vary: 0.2, minGap: 0.45 });
    if (this.hp <= 0) this.die();
    return true;
  }
  hurt(dmg, dirx, dirz, src) {
    const g = this.game; if (!this.alive) return false;
    if (this.invulnerable) { if (this.roll.t >= 0 && !this.roll.perfect) { this.roll.perfect = true; g.perfectDodge(this); } return false; }
    if (this.buffs.shield > 0) { this.buffs.shield = 0; g.audio.play('sfx_shield_break', { vol: 0.9 }); this.ctx.particlesAdd.burst(this.x, 1, this.z, { n: 30, type: P.SPARK, color: new THREE.Color(0xffcf4a), speed: 5, life: 0.5, size: 0.14 }); this.iframes = 0.6; return false; }
    this.hp -= dmg; this.iframes = 0.9; this.hurtT = 0.5; this.trauma = Math.min(1, this.trauma + 0.45); this.hurtDir = Math.atan2(dirx, dirz);
    g.audio.play('sfx_knox_hurt', { vol: 0.9, vary: 0.1 }); g.onPlayerHurt(this, dmg, dirx, dirz);
    this.anim.upperShot('hit', 0.04, 1.6);
    this.vx += dirx * 3; this.vz += dirz * 3;
    if (this.hp <= 0) { this.hp = 0; this.die(dirx, dirz); }
    return true;
  }
  heal(n) { this.hp = Math.min(this.maxhp, this.hp + n); }
  die(dirx, dirz) { this.alive = false; this.dead = true; this.locked = null; this.charging = false; this.anim.shot('knockdown', null, 0.05, { hold: true, timeScale: 1.3 }); this.game.onPlayerDown(this); }
  addKill(e, head) { this.kills++; if (head) this.headshots++; this.combo = Math.min(8, this.combo + (this.comboT > 0 ? 1 : 0)); if (this.comboT <= 0) this.combo = 1; this.comboT = 3; this.bestStreak = Math.max(this.bestStreak, this.combo); this.ult = Math.min(100, this.ult + (e.boss ? 25 : 6)); }
  breakCombo() { if (this.combo > 2) this.game.hud.stamp(COPY.stamps.streakBreak, 'red'); this.combo = 1; }
  // ---------- per-frame ----------
  update(dt, alpha) {
    const g = this.game; const R = this.roll;
    // interpolated position
    const ix = lerp(this.px, this.x, alpha), iz = lerp(this.pz, this.z, alpha);
    this.bob = this.swim ? Math.sin(g.time * 1.6) * 0.08 : 0;
    this.root.position.set(ix, this.y + this.bob, iz); this.root.rotation.y = this.faceYaw;
    // animation state
    const A = this.anim; const aiming = this.aimW > 0.5;
    if (this.alive && R.t < 0) {
      if (this.swim) { A.play(this.speedN > 0.1 ? 'swim' : 'swim_idle', 0.25); const a = A.current; if (a) a.setEffectiveTimeScale(this.speedN > 0.1 ? 0.7 + this.speedN * 0.8 : 1); }
      else if (this.speedN > 0.08) { const back = this.aimW > 0.5 && this.locked && Math.cos(angDiff(this.faceYaw, Math.atan2(this.vx, this.vz))) < -0.3; A.play(back ? 'walk_shoot_back' : 'run_gun', 0.15); const a = A.current; if (a) a.setEffectiveTimeScale(back ? 1.4 : 0.55 + this.speedN * 0.6); }
      else A.play(this.combatT > 0 || aiming ? 'combat_idle' : 'idle', 0.3);
      A.setUpper(this.swim ? null : 'walk_shoot_fwd', this.aimW, 0.12);
    }
    A.update(dt);
    // aim offset: bend spine/head toward the aim point (pitch only; yaw handled by facing)
    if (this.alive && this.aimW > 0.01) {
      const tp = this.aimPoint(_v); const dy = tp.y - (this.y + 1.2), dxz = Math.hypot(tp.x - this.x, tp.z - this.z) || 1; const pitch = clamp(Math.atan2(dy, dxz), -0.6, 0.7) * this.aimW;
      const bend = (name, k) => { const b = this.bones[name]; if (!b) return; _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch * k); b.quaternion.multiply(_q); };
      bend('Spine02', 0.35); bend('Spine01', 0.25); bend('neck', 0.2); bend('Head', 0.2);
    }
    // recoil + kick decay
    if (this.kick > 0) { this.kick = Math.max(0, this.kick - dt * 6); const b = this.bones.RightForeArm; if (b) { _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.kick * 0.25); b.quaternion.multiply(_q); } }
    this.root.updateMatrixWorld(true);
    // muzzle world pos + blaster direction
    const mz = this.gear.blaster.muzzle; mz.getWorldPosition(this.muzzleW); this.gear.blaster.group.getWorldDirection(this.blasterDirW);
    // blaster lamp (flashlight)
    const lamp = this.ctx.lighting; if (lamp) { _v2.copy(this.blasterDirW); const ap = this.aimPoint(_v); _v2.subVectors(ap, this.muzzleW).normalize(); lamp.setLamp(this.muzzleW, _v2, this.lampOn && g.state === 'play', 1); }
    // material: hurt flash / low hp
    const hurtF = this.hurtT > 0.35 ? 1 : 0; this.mat.emissive.setRGB(hurtF * 0.6, 0, 0);
    // blaster core glows with ult
    const glow = this.gear.blaster.glowMat; glow.emissiveIntensity = 1.5 + this.ult / 100 * 3 + (this.charging ? 4 : 0) + (this.buffs.overcharge > 0 ? 3 : 0);
    // footsteps
    if (this.alive && this.speedN > 0.2 && !this.swim) { this.footT += dt * this.speedN * 3.4; if (this.footT > 1) { this.footT = 0; g.audio.play('sfx_step_' + g.world.THEME.key, { vol: 0.35, vary: 0.15 }); } }
    this.updateCamera(dt);
  }
  updateCamera(dt) {
    const c = this.cam; const cam = this.ctx.camera; const g = this.game;
    c.dist = damp(c.dist, c.targetDist, 8, dt);
    const shoulder = this.locked ? c.shoulder * (Math.sin(angDiff(c.yaw, Math.atan2(this.locked.x - this.x, this.locked.z - this.z))) > 0.5 ? -1 : 1) : c.shoulder; c.side = damp(c.side, shoulder, 6, dt);
    const px = this.root.position.x, pz = this.root.position.z, py = this.y + 1.12;
    const fx = Math.sin(c.yaw) * Math.cos(c.pitch), fy = Math.sin(c.pitch), fz = Math.cos(c.yaw) * Math.cos(c.pitch); const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    // Occlusion. The old test only shoved the lens OUT of a prop it was already inside, which still left
    // the prop BETWEEN Knox and the lens: over 312 position/yaw samples in THE DROWN he was partly hidden
    // on 12.2% and completely hidden on 3.5%. Props are upright, so sweeping the horizontal segment from
    // Knox out to the lens against the world's blocker circles is exact enough and costs one pass over
    // ~130 circles -- no scene raycast. camBlockers exists because half the coral in THE DROWN is
    // drawn but deliberately walk-through, so obstacles alone does not know about the tubes he vanishes
    // behind. h is the prop's drawn height, so a stump the sightline passes over is skipped.
    const env = g.world && g.world.env; const blk = env && (env.camBlockers || env.obstacles);
    let want = c.dist;
    if (blk && blk.length) {
      const cp = Math.max(0.1, Math.cos(c.pitch)); const hFull = Math.max(1e-3, c.dist * cp);
      const camY0 = Math.max(0.35, py - fy * c.dist + 0.1);
      // Sight from his HIPS, not his chest: a waist-high coral clears the chest line and still swallows
      // half of him. Below the hips is shins, and pulling the lens in for shins would make the field jumpy.
      const oy = py - 0.32;
      const hx = -Math.sin(c.yaw), hz = -Math.cos(c.yaw); const ox = px + rx * c.side, oz = pz + rz * c.side;
      let hmax = hFull;
      for (let i = 0; i < blk.length; i++) {
        const o = blk[i]; const ex = ox - o.x, ez = oz - o.z; const rr = o.r + CAM_GRAZE;
        const bb = ex * hx + ez * hz, cc = ex * ex + ez * ez - rr * rr; const disc = bb * bb - cc;
        if (disc <= 0) continue;
        const sq = Math.sqrt(disc); if (-bb + sq <= 0) continue;   // wholly behind Knox
        const t0 = Math.max(0, -bb - sq); if (t0 >= hmax) continue;
        if (o.h !== undefined && o.h < oy + (camY0 - oy) * (t0 / hFull)) continue;
        hmax = t0;
      }
      want = Math.max(CAM_MIN, hmax / cp);
    }
    // Snap IN the instant something intervenes (a slow pull-in still hides him for the duration of the
    // ease), but crawl back out so clearing a prop is not a lurch.
    c.occl = c.occl === undefined || want < c.occl ? want : damp(c.occl, want, 3.5, dt);
    const dist = c.occl;
    let cx = px - fx * dist + rx * c.side, cy = py - fy * dist + 0.1, cz = pz - fz * dist + rz * c.side;
    // keep camera above ground & inside arena dressing
    if (cy < 0.35) cy = 0.35;
    // last-resort push-out: the sweep can still leave the lens inside a circle whose entry it started past
    if (blk) for (const o of blk) { const dx = cx - o.x, dz = cz - o.z; const d = Math.hypot(dx, dz); if (d < o.r + 0.3 && d > 1e-3 && (o.h === undefined || o.h > cy)) { cx = o.x + dx / d * (o.r + 0.3); cz = o.z + dz / d * (o.r + 0.3); } }
    // ...and that push-out is free to shove it INTO Knox, so re-seat it at the minimum stand-off after
    { const dx = cx - px, dz = cz - pz; const dh = Math.hypot(dx, dz); if (dh < CAM_MIN) { const k2 = dh > 1e-3 ? CAM_MIN / dh : 0; cx = dh > 1e-3 ? px + dx * k2 : px - fx * CAM_MIN; cz = dh > 1e-3 ? pz + dz * k2 : pz - fz * CAM_MIN; } }
    const k = 1 - Math.exp(-dt / 0.12), kv = 1 - Math.exp(-dt / 0.2);
    if (!c.init) { c.pos.set(cx, cy, cz); c.init = true; }
    c.pos.x = lerp(c.pos.x, cx, k); c.pos.z = lerp(c.pos.z, cz, k); c.pos.y = lerp(c.pos.y, cy, kv);
    // shake (trauma model)
    this.trauma = Math.max(0, this.trauma - dt * 1.6); const sh = this.trauma * this.trauma * (g.save.data.settings.shake ?? 1); this.shakeT += dt * 25;
    const n1 = Math.sin(this.shakeT * 1.3) * Math.cos(this.shakeT * 0.7), n2 = Math.sin(this.shakeT * 0.9 + 2) * Math.cos(this.shakeT * 1.7), n3 = Math.sin(this.shakeT * 1.1 + 4);
    cam.position.set(c.pos.x + n1 * 0.2 * sh, c.pos.y + n2 * 0.15 * sh, c.pos.z + n3 * 0.2 * sh);
    if (this.swim) { c.sway += dt * 0.4 * Math.PI * 2; cam.position.y += Math.sin(c.sway) * 0.08; }
    c.lookAt.set(px + fx * 4 + rx * c.side * 0.6, py + fy * 4, pz + fz * 4 + rz * c.side * 0.6); cam.lookAt(c.lookAt);
    cam.rotateZ(n2 * 0.045 * sh); if (this.recoil > 0) { cam.rotateX(this.recoil * 0.01); this.recoil = Math.max(0, this.recoil - dt * 30); }
    if (c.fovKick > 0) { c.fovKick = Math.max(0, c.fovKick - dt * 4); }
    const fov = (this.aimW > 0.5 ? 46 : 50) + c.fovKick * 8 + (this.buffs.quick > 0 ? 3 : 0); if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 10, dt); cam.updateProjectionMatrix(); }
  }
  dispose() { this.gear.dispose(); this.ctx.scene.remove(this.root); }
}
