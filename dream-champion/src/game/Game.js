// Game orchestrator: states (title → play → wake/cleared → map → ending), world lifecycle, feedback (juice), pickups, ult, boss cinematics.
import * as THREE from 'three';
import { Loop } from '../core/loop.js';
import { Input, isTouchDevice } from '../core/input.js';
import { save } from '../core/save.js';
import { bus } from '../core/events.js';
import { Sky } from '../render/sky.js';
import { Lighting } from '../render/lighting.js';
import { Particles, P } from '../render/particles.js';
import { Decals, D } from '../render/decals.js';
import { FOG } from '../render/fx.js';
import { Player } from './Player.js';
import { Director } from './Director.js';
import { Projectiles } from './Projectiles.js';
import { BRAINS } from './Enemy.js';
import { BOSS_BRAINS } from './Boss.js';
import { WORLDS, WORLD_ORDER } from './worlds/index.js';
import { ENEMIES } from './data/enemies.js';
import { COPY } from './data/copy.js';
import { hud } from '../ui/hud.js';
import { panels } from '../ui/panels.js';
import { fxdom } from '../ui/fxdom.js';
import { showWakeFilm } from '../ui/wake-film.js';
import { clamp, rnd, pick, lerp, damp } from '../core/math.js';

BRAINS.boss = (e, step, player, dist, nx, nz, g) => BOSS_BRAINS[e.key](e, step, player, dist, nx, nz, g);
const _v = new THREE.Vector3(), _c = new THREE.Color();

export class Game {
  constructor(renderer, assets, audio) {
    this.renderer = renderer; this.assets = assets; this.audio = audio; this.save = save; this.hud = hud; this.panels = panels;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 260);
    this.sky = new Sky(); this.scene.add(this.sky.mesh); this.lighting = new Lighting(renderer, this.scene, this.sky);
    const T = renderer.tier; this.particlesAdd = new Particles(this.scene, T.particles, true); this.particlesAlpha = new Particles(this.scene, T.particles >> 1, false); this.decals = new Decals(this.scene, T.decals);
    this.lighting.setShadowSize(T.shadow);
    this.input = new Input(document.getElementById('app')); this.loop = new Loop(this);
    this.ctx = { game: this, scene: this.scene, camera: this.camera, renderer, sky: this.sky, lighting: this.lighting, particlesAdd: this.particlesAdd, particlesAlpha: this.particlesAlpha, decals: this.decals, assets, audio, input: this.input, loop: this.loop, save, bus, time: 0 };
    this.time = 0; this.state = 'boot'; this.world = null; this.worldKey = null; this.projectiles = new Projectiles(this.ctx); this.director = new Director(this.ctx);
    this.flashLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 9, 1.8); this.scene.add(l); return { l, t: 0, i: 0 }; });
    this.fill = new THREE.PointLight(0xbfd8ff, 6, 9, 1.6); this.scene.add(this.fill);
    this.autoBlast = save.data.settings.autoBlast !== false; this.difficulty = save.data.settings.difficulty || 'brave'; this.hpMul = 1; this.bossActive = false; this.stats = null;
    this.fps = { t: 0 }; this.paused = false;
    addEventListener('resize', () => this.onResize()); this.onResize();
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.state === 'play') this.pause(); } });
    matchMedia('(orientation: portrait)').addEventListener('change', e => { if (e.matches && this.state === 'play') this.pause(); });
    hud.setTouchVisible(isTouchDevice()); hud.lefty(!!save.data.settings.lefty); this.input.setLefty(!!save.data.settings.lefty);
    if (!isTouchDevice()) document.body.classList.add('nokb');
  }
  onResize() { this.renderer.resize(); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  // ---------- world lifecycle ----------
  async loadWorld(key, onProgress) {
    await this.assets.loadGroup(key, onProgress);
    if (this.world) this.unloadWorld();
    const W = WORLDS[key]; const env = W.build(this.ctx, this.renderer.tier); this.scene.add(env.group);
    this.world = { key, THEME: W.THEME, env }; this.worldKey = key; this.sky.apply(W.THEME.sky); this.lighting.apply(W.THEME.rig); Object.assign(this.renderer.grade, { exposure: W.THEME.grade.exposure, saturation: W.THEME.grade.saturation, contrast: W.THEME.grade.contrast, bloom: W.THEME.grade.bloom, vignette: W.THEME.grade.vignette }); this.renderer.grade.lift.fromArray(W.THEME.grade.lift); this.renderer.grade.gain.fromArray(W.THEME.grade.gain);
    this.renderer.fx.underwater = W.THEME.underwater ? 1 : 0; this.sky.uniforms.underwater.value = W.THEME.underwater ? 1 : 0; this.audio.setWorldFilter(!!W.THEME.underwater);
    this.decals.clear(); this.particlesAdd.clear(); this.particlesAlpha.clear(); this.projectiles.clear();
    if (this.player) this.player.setWorld(W.THEME);
    // warm up shaders
    this.renderer.gl.compile(this.scene, this.camera);
  }
  unloadWorld() { this.clearHome(); if (!this.world) return; this.director.disposeAll(); this.scene.remove(this.world.env.group); this.world.env.dispose(); this.world = null; }
  // undo anything a cinematic hid, so no path can strand the player without a world or a blaster
  restoreScene() {
    this.wakeFilm?.dispose(); this.wakeFilm = null;
    const p = this.player; if (p) { p.gear.setVisible(true); p.root.visible = true; }
    if (this.world && this.world.env.group) this.world.env.group.visible = true;
    this.cine = null; this.renderer.fx.hurt = 0; this.renderer.fx.desat = 0; this.bloodT = 0; fxdom.letterbox(false); this.heroLightsOff();
  }
  clearHome() { if (!this.homeEnv) return; this.scene.remove(this.homeEnv.group); this.homeEnv.dispose(); this.homeEnv = null; }
  // ---------- boot / title ----------
  async start() {
    this.player = new Player(this.ctx); this.loop.start();
    await this.loadWorld('forest'); this.title();
  }
  title() {
    this.state = 'title'; hud.hide(); this.cancel(); this.clearHome(); this.director.clearAll(); this.projectiles.clear(); this.bossActive = false; this.input.unlockMouse();
    const p = this.player; p.setWorld(this.world.THEME); p.x = 0; p.z = 0; p.faceYaw = Math.PI * 0.15; p.anim.stopAll(); p.anim.play('look_around', 0); p.combatT = 0; p.lampOn = false;
    this.titleT = 0; this.assets.prefetch('intro'); this.assets.prefetch('home');
    this.audio.setMusic({ bed: 'title' }, 2); this.audio.setMusicMix({ bed: 1 }, 1);
    fxdom.fade(0, 1200);
    panels.title(a => this.onTitle(a), { settings: save.data.settings, pickDifficulty: !save.data.settings.seenIntro });
  }
  onTitle(a) {
    if (a.startsWith('difficulty:')) { this.difficulty = a.split(':')[1]; save.data.settings.difficulty = this.difficulty; save.write(); return; }
    if (a === 'settings') { panels.settings(x => { if (x === 'back') panels.title(b => this.onTitle(b), { settings: save.data.settings }); else this.applySetting(x); }, save.data.settings); return; }
    if (a === 'start') { this.audio.ensure(); this.audio.play('sfx_ui', { ui: true });
      const iv = this.assets.manifest.groups.intro?.find(x => x.type === 'video');
      if (iv) this.primeVideo(this.assets.url(iv.url));   // must start inside the tap for iOS
      this.beginAdventure(); }
  }
  async beginAdventure() {
    panels.hide(); const first = !save.data.settings.seenIntro;
    await this.bedtime();                      // Knox climbs in between mum and dad, every run
    if (first) { save.data.settings.seenIntro = true; save.write(); await this.blasterWake(); await panels.coldOpen(COPY.coldOpen); this.audio.play('sfx_whisper_knox', { vol: 0.8 }); await this.enterWorld('forest'); }
    else { await this.blasterWake(); this.map(); }
  }
  // ---------- opening: Knox climbs in with mum and dad (generated film, bookends the ending) ----------
  async bedtime() {
    const vid = this.assets.manifest.groups.intro?.find(a => a.type === 'video');
    if (!vid) return;
    this.state = 'cine'; this.cancel(); panels.hide(); hud.hide(); this.input.reset(); this.input.unlockMouse();
    fxdom.fade(1, 500); await new Promise(r => setTimeout(r, 520));
    this.audio.setMusic(null, 1.2);
    let ok = false;
    try { ok = await this.playVideo(this.assets.url(vid.url)); } catch (_) { ok = false; }
    if (!ok) { fxdom.fade(0, 300); }          // couldn't play: skip the beat rather than show a broken scene
    this.cine = null; this.state = 'title';
  }
  wait(sec) {
    if (this._cineSkip) return Promise.resolve();
    return new Promise(r => { (this._cineWaiters || (this._cineWaiters = [])).push(r); this.after(sec, () => { const w = this._cineWaiters || []; const i = w.indexOf(r); if (i >= 0) w.splice(i, 1); r(); }, 'cine'); });
  }
  skipCine() { this._cineSkip = true; this.cancel('cine'); const w = this._cineWaiters || []; this._cineWaiters = []; for (const r of w) r(); }
  async blasterWake() {
    // camera pushes into the blaster; core ignites
    const p = this.player; p.anim.play('draw', 0.2); this.audio.play('sfx_blaster_online', { vol: 1 }); this.audio.musicDuck(0.2, 2.5);
    this.cine = { t: 0, dur: 2.6, kind: 'blaster' }; fxdom.letterbox(true);
    await new Promise(r => setTimeout(r, 2400)); hud.show(); hud.hideUI(true); hud.stamp(COPY.blasterOnline, 'cyan'); this.audio.play('sfx_thump', { vol: 1 });
    await new Promise(r => setTimeout(r, 1200)); fxdom.letterbox(false); this.cine = null; hud.hideUI(false); hud.hide();
  }
  map() { this.state = 'map'; hud.hide(); this.cancel(); this.clearHome(); this.restoreScene(); this.input.unlockMouse(); panels.map({ slain: save.data.slain, secrets: save.data.secrets }, a => { if (a.startsWith('world:')) this.enterWorld(a.split(':')[1]); else if (a === 'settings') panels.settings(x => { if (x === 'back') this.map(); else this.applySetting(x); }, save.data.settings); }); }
  applySetting(x) { const [, k, v] = x.split(':'); const s = save.data.settings; if (k === 'autoBlast') { s.autoBlast = v === 'true'; this.autoBlast = s.autoBlast; } else if (k === 'look') s.look = +v; else if (k === 'lefty') { s.lefty = v === 'true'; hud.lefty(s.lefty); this.input.setLefty(s.lefty); } else if (k === 'shake') s.shake = +v; else if (k === 'quality') { s.quality = v; if (v !== 'auto') this.setTier(v); } else if (k === 'difficulty') { s.difficulty = v; this.difficulty = v; } save.write(); }
  async wake(on) {
    try { if (on) { if (!this._wl) this._wl = await navigator.wakeLock.request('screen'); } else if (this._wl) { this._wl.release(); this._wl = null; } } catch (_) { }
  }
  setTier(name) { this.renderer.setTier(name); this.lighting.setShadowSize(this.renderer.tier.shadow); }
  // ---------- play ----------
  async enterWorld(key) {
    try { await this._enterWorld(key); }
    catch (e) {
      console.error(e); const load = document.getElementById('load'); load.classList.add('out');
      this.state = 'map'; fxdom.fade(0, 400); hud.hide(); this.input.unlockMouse();
      panels.error(a => { if (a === 'retry') this.enterWorld(key); else this.map(); });
    }
  }
  async _enterWorld(key) {
    panels.hide(); this.state = 'loading'; fxdom.fade(1, 500); await new Promise(r => setTimeout(r, 520)); hud.hide();
    const load = document.getElementById('load'); load.classList.remove('out'); load.querySelector('#loadmsg').textContent = COPY.worlds[key].name;
    await this.loadWorld(key, f => { load.querySelector('#loadfill').style.width = (f * 100).toFixed(0) + '%'; });
    load.classList.add('out'); const p = this.player; p.setWorld(this.world.THEME); p.lampOn = true; this.heroLightsOff(); this.director.setup(key); p.kills = 0; p.headshots = 0; p.bestStreak = 1; this.stats = { kills: 0, headshots: 0, streak: 1, t0: this.time, secret: false }; this.hpMul = (this.difficulty === 'brutal' ? 1.35 : 1); this.bossActive = false; this.killTimes = []; this.lastTut = 0;
    hud.reset && hud.reset(); hud.show(); hud.setHP(p.hp, p.maxhp); hud.setKills(0); hud.setUlt(0); hud.setDash(2, 2); hud.boss(null); hud.setWorld(this.world.THEME.name, ''); hud.reticle('free');
    this.audio.setMusic(this.world.THEME.music, 1.5); this.audio.setMusicMix({ bed: 1 }, 0.5);
    this.state = 'play'; this.input.reset(); fxdom.fade(0, 900); this.director.startLevel(); this.input.lockMouse(); this.wake(true); this.renderer.dyn.settle && this.renderer.dyn.settle(3);
    const next = WORLD_ORDER[WORLD_ORDER.indexOf(key) + 1];
    for (const k of WORLD_ORDER) if (k !== key && k !== next) this.assets.releaseGroup(k);
    this.assets.prefetch('home'); this.assets.prefetch('wake');   // the wake film should be warm before he needs it, not fetched at the moment he dies
    if (next) this.after(8, () => this.assets.prefetch(next), 'wave');
    if (isTouchDevice() && !save.data.settings.seenTut[key]) { this.tutorial = ['move', 'look', 'blast', 'dash']; this.tutT = 1.5; } else if (!isTouchDevice() && !save.data.settings.seenTut.kb) { hud.ghost(COPY.ghost.kb); setTimeout(() => hud.ghost(null), 7000); save.data.settings.seenTut.kb = true; save.write(); }
  }
  pause() { if (this.state !== 'play' || this.paused) return; this.paused = true; this.loop.timeScale = 0; this.input.reset(); this.input.unlockMouse(); hud.hideUI(true); this.audio.musicDuck(0.3, 999); panels.pause(a => { if (a === 'resume') this.resume(); else if (a === 'quit') { this.resume(true); this.map(); } else this.applySetting(a); }, save.data.settings); }
  // gameplay-time timers: paused with the game, cancelled on every state change
  after(sec, fn, tag) { (this._timers || (this._timers = [])).push({ t: sec, fn, tag }); }
  cancel(tag) { if (!this._timers) return; this._timers = this._timers.filter(x => tag ? x.tag !== tag : false); }
  tickTimers(real) {
    const L = this._timers; if (!L || !L.length || this.paused || document.hidden) return;
    for (let i = L.length - 1; i >= 0; i--) { const x = L[i]; x.t -= real; if (x.t <= 0) { L.splice(i, 1); try { x.fn(); } catch (e) { console.error(e); } } }
  }
  resume(silent) { this.paused = false; this.loop.timeScale = 1; panels.hide(); hud.hideUI(false); if (this.audio.musBus) this.audio.musBus.gain.setTargetAtTime(0.75, this.audio.ctx.currentTime, 0.3); if (!silent) this.input.lockMouse(); }
  // ---------- loop ----------
  fixedUpdate(step) {
    if (this.state !== 'play' || this.paused) return; this.time += step; this.ctx.time = this.time;
    const inp = this.input.poll(step); if (inp.pause) { this.pause(); return; } if (inp.mute) this.audio.setMuted(!this.audio.muted);
    const enemies = this.director.enemies;
    this.player.fixedUpdate(step, inp, enemies); this.director.fixedUpdate(step);
    if (this.state !== 'play') return;
    this.projectiles.fixedUpdate(step, enemies, this.player, this.world);
    if (this.state !== 'play') return;
    this.tutorialStep(step, inp);
    if (this.player.locked) { const e = this.player.locked; _v.set(e.x, (e.y || 0) + e.height * 0.6, e.z).project(this.camera); const on = _v.z < 1; hud.reticle(on ? (e.boss && e.weakOpen ? 'weak' : 'lock') : 'free', on ? (_v.x + 1) / 2 * innerWidth : 0, on ? (1 - _v.y) / 2 * innerHeight : 0); } else hud.reticle('free');
  }
  update(dt, real, alpha) {
    if (this.state === 'boot') return; this.tickTimers(real); this.ctx.time = this.time; FOG.time.value = this.time + (this.state !== 'play' ? real * 0 : 0);
    if (this.state !== 'play') { this.time += real; FOG.time.value = this.time; }
    const p = this.player; const inpMute = null;
    if (this.state === 'play' && !this.paused) { p.update(dt, alpha); this.director.update(dt, alpha); }
    else if (this.state === 'title' || this.state === 'map' || this.state === 'loading') { p.anim.update(real); this.titleT = (this.titleT || 0) + real; this.titleCamera(real); }
    else if (this.state === 'wake' || this.state === 'cleared' || this.state === 'cine' || this.state === 'ending') { p.anim.update(real); this.director.update(real, alpha); this.cineCamera(real); }
    if (this.cine && this.cine.kind === 'blaster') this.blasterCam(real);
    this.particlesAdd.update(real); this.particlesAlpha.update(real); this.decals.update(real);
    if (this.world) this.world.env.update(real, this.time, p.root.position);
    this.sky.update(this.time, this.camera.position); this.lighting.update(p.root.position, _v.set(Math.sin(p.cam.yaw), 0, Math.cos(p.cam.yaw)));
    for (const f of this.flashLights) { if (f.t > 0) { f.t -= real; f.l.intensity = Math.max(0, f.t / 0.08) * f.i; } }
    // HUD sync
    if (this.state === 'play') { hud.setHP(p.hp, p.maxhp, p.hurtT > 0.4); hud.setUlt(p.ult / 100); if (p.ult >= 100) this.ultHint(); hud.setDash(p.roll.charges, 2); hud.setStreak(p.combo, p.comboT / 3, false); hud.low(p.hp < 40 && p.alive); if (p.hp < 40 && p.alive) { this.heartT = (this.heartT || 0) + real * (0.9 + (1 - p.hp / 40) * 0.9); if (this.heartT > 1) { this.heartT = 0; this.audio.play('sfx_heartbeat', { vol: 0.7 }); } } }
    const fx = this.renderer.fx; fx.hurt = damp(fx.hurt, p.hurtT > 0 && this.state === 'play' ? 0.35 : 0, 8, real); fx.desat = p.hp < 40 && this.state === 'play' ? 0.3 : 0; fx.vision = p.buffs.vision > 0 ? 1 : 0; if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - real * 4); if (fx.ultRing > 0) fx.ultRing = Math.min(1, fx.ultRing + real * 1.6); if (fx.ultRing >= 1) fx.ultRing = 0;
    if (this.bloodT > 0) { this.bloodT -= real; fx.hurt = Math.max(fx.hurt, 0.6); }
    this.audio.setListener(this.camera.position.x, this.camera.position.z, p.cam.yaw);
    this.fill.position.copy(this.camera.position); this.fill.position.y += 1.2; this.fill.intensity = this.state === 'play' ? (this.world && this.world.THEME.underwater ? 10 : 7) : (this.state === 'cine' || this.state === 'title' || this.state === 'map') ? 5 : 0;
    // dynamic resolution
    if (this.state === 'play' && !this.paused && this.renderer.dyn.sample(real * 1000, real)) { this.renderer.resize(true); this.renderer.dyn.settle(2); }
    if (this.world && this.world.THEME.underwater) { fx.underwater = 1; }
  }
  render(alpha, real) { this.renderer.render(this.scene, this.camera, this.time); }
  // debug/test: advance the simulation without rendering (used by the headless harness)
  simulate(seconds, inputFn) { const step = 1 / 60; const n = Math.round(seconds / step); for (let i = 0; i < n; i++) { if (inputFn) inputFn(this.input, i * step); this.fixedUpdate(step); this.update(step, step, 0); } }
  heroLights(x, y, z, a, k = 1, dist = 3) { const L = this.lighting.points; L[0].color.set(0x9fe8ff); L[0].intensity = 26 * k; L[0].distance = 8 * dist / 3; L[0].position.set(x + Math.sin(a + 0.6) * dist, y + 1.2, z + Math.cos(a + 0.6) * dist); L[1].color.set(0xff5a3c); L[1].intensity = 40 * k; L[1].distance = 9 * dist / 3; L[1].position.set(x - Math.sin(a) * dist * 1.1, y + 1.6, z - Math.cos(a) * dist * 1.1); }
  heroLightsOff() { for (const l of this.lighting.points) l.intensity = 0; }
  titleCamera(dt) { const p = this.player; const t = this.titleT; const a = p.faceYaw + Math.PI + 0.55 + Math.sin(t * 0.13) * 0.1; const d = 2.7 - Math.sin(t * 0.1) * 0.2; const px = p.root.position.x, pz = p.root.position.z; this.camera.position.set(px + Math.sin(a) * d, 0.75 + Math.sin(t * 0.2) * 0.06, pz + Math.cos(a) * d); this.camera.lookAt(px - 0.35, 1.05, pz); if (this.camera.fov !== 38) { this.camera.fov = 38; this.camera.updateProjectionMatrix(); } p.root.updateMatrixWorld(true); this.lighting.setLamp(p.root.position, _v.set(0, 0, 1), false);
    // hero lighting for the title: cool key from the camera side, warm rim from behind
    this.heroLights(px, 0.9, pz, a, 1.6, 1.9); }
  blasterCam(dt) { const p = this.player; const c = this.cine; c.t += dt; const m = p.muzzleW; p.root.updateMatrixWorld(true); p.gear.blaster.muzzle.getWorldPosition(m); const u = clamp(c.t / c.dur, 0, 1); const hand = p.bones.RightHand.getWorldPosition(_v); this.camera.position.lerp(new THREE.Vector3(hand.x + 0.9 - u * 0.4, hand.y + 0.35, hand.z + 0.6), 1 - Math.exp(-dt * 3)); this.camera.lookAt(hand); p.gear.blaster.glowMat.emissiveIntensity = 1 + u * 8; if (u > 0.5 && Math.random() < 0.5) this.particlesAdd.one(m.x, m.y, m.z, { type: P.SPARK, color: _c.set(0x4de3ff), life: 0.3, size: 0.06, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(-1, 1) }); }
  cineCamera(dt) {
    if (!this.cine) return; const c = this.cine; c.t += dt;
    if (c.kind === 'bedtime') {
      const p = this.player, bed = c.bed;
      if (c.climb) { // lower him onto the bed while the reversed wake_up plays
        c.climb.t = clamp(c.climb.t + dt / c.climb.dur, 0, 1); const u = c.climb.t * c.climb.t * (3 - 2 * c.climb.t);
        p.root.position.lerpVectors(c.climb.from, c.climb.to, u); p.root.rotation.y = lerp(c.climb.ry0, c.climb.ry1, u);
        p.x = p.root.position.x; p.z = p.root.position.z;
        if (c.climb.t >= 1) c.climb = null;   // stop driving the root, so later settling sticks
      }
      // slow push toward the pillow, settling just above him
      const u = clamp(c.t / c.dur, 0, 1); const e = 1 - Math.pow(1 - u, 2.2);
      this.camera.position.set(bed.x + 2.30 - e * 0.85, 2.02 - e * 0.18, bed.z + 2.20 - e * 0.75);
      this.camera.lookAt(bed.x + 0.02, 0.80 - e * 0.04, bed.z - 0.10);
      if (this.camera.fov !== 42) { this.camera.fov = 42; this.camera.updateProjectionMatrix(); }
      return;
    } if (c.kind === 'boss') { const b = c.boss; const u = clamp(c.t / c.dur, 0, 1); const ang = c.a0 + u * 1.4; const dist = b.r * 3 + 3; this.camera.position.set(b.x + Math.sin(ang) * dist, 0.8 + u * b.height * 0.5, b.z + Math.cos(ang) * dist); this.camera.lookAt(b.x, b.y + b.height * 0.55, b.z); this.heroLights(b.x, b.y + b.height * 0.35, b.z, ang, 5 + Math.sin(c.t * 9) * 0.6, b.r + 2.6); } else if (c.kind === 'killcam') { const b = c.boss; const u = clamp(c.t / c.dur, 0, 1); const ang = c.a0 + u * 0.8; const dist = b.r * 2.5 + 3; this.camera.position.set(b.x + Math.sin(ang) * dist, 1.0 + u * 2, b.z + Math.cos(ang) * dist); this.camera.lookAt(b.x, b.y + b.height * 0.4, b.z); this.heroLights(b.x, b.y + b.height * 0.35, b.z, ang, 4, b.r + 2.6); } else if (c.kind === 'wake' || c.kind === 'ending') { const bed = this.world.env.bedPos || { x: 0, y: 0.5, z: 0 }; const u = clamp(c.t / c.dur, 0, 1); this.camera.position.set(bed.x + 1.6 - u * 0.5, bed.y + 1.6 - u * 0.4, bed.z + 2.2 - u * 0.6); this.camera.lookAt(bed.x, bed.y + 0.6, bed.z); } }
  ultHint() { if (this._ultHinted || this.state !== 'play') return; this._ultHinted = true; hud.ghost(COPY.ghost.ult); this.audio.play('sfx_stamp', { vol: 0.5, ui: true }); this.after(4, () => hud.ghost(null), 'wave'); }
  tutorialStep(step, inp) { if (!this.tutorial || !this.tutorial.length) return; this.tutT -= step; if (this.tutT > 0) return; const k = this.tutorial[0]; if (!this.tutShown) { hud.ghost(COPY.ghost[k]); this.tutShown = true; } const done = (k === 'move' && (Math.abs(inp.mx) + Math.abs(inp.my) > 0.3)) || (k === 'look' && Math.abs(inp.ldx) > 2) || (k === 'blast' && (inp.fire || this.player.kills > 0)) || (k === 'dash' && this.player.roll.t >= 0); if (done) { this.tutorial.shift(); this.tutShown = false; hud.ghost(null); this.tutT = k === 'dash' ? 0 : 2; if (!this.tutorial.length) { save.data.settings.seenTut[this.worldKey] = true; save.write(); } } }
  // ---------- feedback ----------
  shake(t) { this.player.trauma = Math.min(1, this.player.trauma + t); }
  lightFlash(x, y, z, color, intensity = 1) { const f = this.flashLights.reduce((a, b) => a.t < b.t ? a : b); f.l.position.set(x, y, z); f.l.color.set(color); f.t = 0.08; f.i = 30 * intensity; f.l.intensity = f.i; }
  isOnScreen(e) { _v.set(e.x, e.y + e.height * 0.5, e.z).project(this.camera); return _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05; }
  onShot() { }
  bloodScreen() { this.bloodT = 0.5; }
  onEnemyHit(e, amt, head, proj) {
    const p = this.player; hud.hitmarker(head ? 'weak' : 'body'); _v.set(e.x + rnd(-.3, .3), e.y + (head ? e.headY : e.height * 0.6), e.z).project(this.camera); if (_v.z < 1) hud.damageNumber((_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight, String(amt), head ? 'weak' : 'body');
    this.audio.play(head ? 'sfx_hit_head' : 'sfx_hit_flesh', { x: e.x, z: e.z, vol: 0.8, vary: 0.12, minGap: 0.04 }); this.audio.play(head ? 'sfx_tick_weak' : 'sfx_tick', { ui: true, vol: 0.35, minGap: 0.05 });
    const col = _c.set(e.def.blood); const hy = e.y + (head ? e.headY : e.height * 0.6);
    if (e.def.gore === 'cloud') { this.particlesAlpha.burst(e.x, hy, e.z, { n: 6, type: P.SMOKE, color: col, speed: 0.6, life: 1.8, size: 0.5, sizeEnd: 1.6, gravity: -0.2 }); }
    else { const dir = proj ? new THREE.Vector3(proj.vx, proj.vy, proj.vz).normalize() : null; this.particlesAlpha.burst(e.x, hy, e.z, { n: head ? 16 : 8, type: P.DROP, color: col, speed: 4, spread: 0.7, dir, life: 0.5, size: 0.08, gravity: 12, stretch: 0.4 }); if (Math.random() < 0.6) this.decals.splat(e.x + rnd(-.6, .6), e.z + rnd(-.6, .6), col, 0.9); }
    if (e.def.gore === 'ash') this.particlesAdd.burst(e.x, hy, e.z, { n: 6, type: P.EMBER, color: _c.set(0xff8a2a), speed: 2, life: 0.6, size: 0.08, gravity: -2 });
    if (e.boss) hud.bossHP(e.hp / e.maxhp, true);
  }
  onEnemyKill(e, head, dx, dz, proj) {
    const p = this.player; p.addKill(e, head); this.stats.kills++; if (head) this.stats.headshots++; this.stats.streak = Math.max(this.stats.streak, p.combo);
    hud.setKills(p.kills); hud.hitmarker('kill'); this.audio.play('sfx_tick_kill', { ui: true, vol: 0.5 });
    if (!e.boss) { this.loop.stopTime(head ? 70 : 40); this.shake(0.2); }
    const col = _c.set(e.def.blood); const hy = e.y + e.height * 0.6;
    if (head) { hud.stamp(COPY.stamps.headshot, 'gold'); this.audio.play('sfx_headshot', { x: e.x, z: e.z, vol: 1 }); this.gore(e, 'skull', dx, dz, 1); }
    this.audio.play('sfx_' + e.def.voice + '_death', { x: e.x, z: e.z, vol: 0.95, vary: 0.1 });
    if (e.def.gore === 'cloud') { this.particlesAlpha.burst(e.x, hy, e.z, { n: 18, type: P.SMOKE, color: col, speed: 1.2, life: 2.5, size: 0.8, sizeEnd: 3.2, gravity: -0.3 }); this.particlesAdd.burst(e.x, hy, e.z, { n: 20, type: P.BUBBLE, color: _c.set(0xbfe8ff), speed: 2, life: 1.5, size: 0.15, up: 2 }); }
    else { this.particlesAlpha.burst(e.x, hy, e.z, { n: 26, type: P.DROP, color: col, speed: 5, life: 0.7, size: 0.1, gravity: 12, stretch: 0.5 }); for (let i = 0; i < 3; i++) this.decals.splat(e.x + rnd(-1, 1), e.z + rnd(-1, 1), col, 1.6); }
    if (e.def.gore === 'ash') { this.particlesAdd.burst(e.x, hy, e.z, { n: 30, type: P.EMBER, color: _c.set(0xff7a2a), color2: _c.set(0xffe0a0), speed: 3, life: 1.2, size: 0.1, gravity: -1.5 }); this.particlesAlpha.burst(e.x, hy, e.z, { n: 14, type: P.ASH, color: _c.set(0x2a2626), speed: 1.5, life: 2, size: 0.12, gravity: -0.4 }); }
    if (e.def.gore === 'pop') { this.particlesAlpha.burst(e.x, hy, e.z, { n: 40, type: P.CHUNK, color: _c.set(0x3a5a1a), speed: 6, life: 1, size: 0.16, gravity: 10 }); this.puddle(e.x, e.z, 2.2, 0x6aff2a); hud.stamp(COPY.stamps.popped, 'red'); }
    // kill feed + multikill
    const feed = COPY.feed[e.key]; if (feed) hud.killfeed(head ? feed[0] : pick(feed));
    const now = this.time; this.killTimes = this.killTimes.filter(t => now - t < 0.5); this.killTimes.push(now); const n = this.killTimes.length; if (n >= 2) { hud.stamp(COPY.multikill[Math.min(n, 5)], n >= 4 ? 'red' : 'white'); this.audio.play('sfx_multikill', { ui: true, vol: 0.8, rate: 1 + n * 0.08 }); }
    hud.setStreak(p.combo, 1, false);
    // drops
    const roll = Math.random(); if (roll < 0.10 && p.hp < p.maxhp) this.spawnPickup(e.x, e.z, 'heart'); else if (roll < 0.22 && !e.boss) this.spawnPickup(e.x, e.z, pick(['overcharge', 'vision', 'quick', 'shield']));
  }
  gore(e, kind, dx, dz, n) { const col = _c.set(e.def.blood); const y = e.y + (kind === 'skull' ? e.headY : e.height * 0.6); this.particlesAlpha.burst(e.x, y, e.z, { n: kind === 'skull' ? 14 : 8 * n, type: kind === 'skull' ? P.CHUNK : P.CHUNK, color: kind === 'skull' ? _c.set(0xd9d2bd) : _c.set(e.def.blood).lerp(_c.set(0x201010), 0.4), speed: 5, life: 1.2, size: kind === 'skull' ? 0.12 : 0.2, gravity: 11, up: 3 }); if (kind === 'skull') this.particlesAlpha.one(e.x, y, e.z, { type: P.SKULL, color: _c.set(0xe8e0c8), life: 1.4, size: 0.35, vx: dx * 3 + rnd(-1, 1), vy: 5, vz: dz * 3 + rnd(-1, 1), gravity: 12, spin: 12 }); this.particlesAlpha.burst(e.x, y, e.z, { n: 20, type: P.DROP, color: col, speed: 5, life: 0.6, size: 0.1, gravity: 12, stretch: 0.5 }); }
  puddle(x, z, r, color) { this.decals.add(x, z, { type: D.PUDDLE, size: r * 2, color: _c.set(color), life: 4.5, alpha: 0.75, fadeIn: 0.1 }); this.director.puddles.push({ x, z, r, t: 4, tick: 0 }); this.audio.play('sfx_acid_hiss', { x, z, vol: 0.7 }); }
  perfectDodge(p) { this.loop.slowMo(0.35, 0.5); hud.stamp(COPY.stamps.dodge, 'gold'); this.audio.play('sfx_dodge', { ui: true, vol: 0.9 }); p.ult = Math.min(100, p.ult + 15); this.particlesAdd.burst(p.x, 1, p.z, { n: 20, type: P.SPARK, color: _c.set(0xffcf4a), speed: 4, life: 0.5, size: 0.12 }); this.stats.dodges = (this.stats.dodges || 0) + 1; }
  onPlayerHurt(p, dmg, dx, dz) { hud.damageDir(Math.atan2(dx, dz) - p.cam.yaw + Math.PI); this.renderer.fx.hurt = 0.5; fxdom.flash(0.25, 90, '#ff2438'); this.audio.musicDuck(0.5, 0.4); }
  spawnPickup(x, z, kind) { const geo = kind === 'heart' ? new THREE.OctahedronGeometry(0.28, 0) : new THREE.IcosahedronGeometry(0.28, 0); const color = { heart: 0xff3a5a, overcharge: 0xff4d4d, vision: 0xff2438, quick: 0x4de3ff, shield: 0xffcf4a }[kind]; const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, roughness: 0.3 })); m.position.set(x, 0.6, z); this.scene.add(m); const R = this.world.THEME.radius - 1; const d = Math.hypot(x, z); if (d > R) { x *= R / d; z *= R / d; } this.director.pickups.push({ obj: m, x, z, kind, t: 12 }); this.particlesAdd.burst(x, 0.6, z, { n: 12, type: P.SPARK, color: _c.set(color), speed: 2, life: 0.5, size: 0.1 }); }
  spawnChest() { const p = this.player; this.spawnPickup(p.x + 2, p.z + 2, 'heart'); this.spawnPickup(p.x - 2, p.z + 2, pick(['overcharge', 'vision', 'quick', 'shield'])); }
  collectPickup(pk) { const p = this.player; const k = pk.kind; if (k === 'heart') { p.heal(25); hud.pickup(COPY.pickups.heart); } else if (k === 'overcharge') { p.buffs.overcharge = 8; hud.pickup(COPY.pickups.overcharge); } else if (k === 'vision') { p.buffs.vision = 10; hud.pickup(COPY.pickups.vision); } else if (k === 'quick') { p.buffs.quick = 8; hud.pickup(COPY.pickups.quick); } else if (k === 'shield') { p.buffs.shield = 15; hud.pickup('DREAM SHIELD'); } this.audio.play('sfx_pickup', { ui: true, vol: 0.9 }); this.particlesAdd.burst(p.x, 1, p.z, { n: 24, type: P.STAR, color: _c.set(pk.obj.material.color), speed: 3, life: 0.6, size: 0.14, spin: 6 }); pk.obj.geometry.dispose(); pk.obj.material.dispose(); }
  breaker(p) {
    p.ult = 0; this.audio.play('sfx_breaker', { vol: 1 }); this.loop.stopTime(120); this.shake(0.9); fxdom.flash(0.7, 220, '#4de3ff'); const fx = this.renderer.fx; fx.ultRing = 0.001; _v.set(p.x, p.y + 1, p.z).project(this.camera); fx.ultCenter.set((_v.x + 1) / 2, (_v.y + 1) / 2);
    p.anim.shot('jump', null, 0.05, { timeScale: 1.6 }); hud.stamp(COPY.ult, 'cyan');
    this.particlesAdd.one(p.x, 0.3, p.z, { type: P.RING, color: _c.set(0x4de3ff), life: 0.7, size: 1, sizeEnd: 16, vx: 0, vy: 0, vz: 0 }); this.particlesAdd.burst(p.x, 1, p.z, { n: 80, type: P.SPARK, color: _c.set(0x4de3ff), color2: _c.set(0xffffff), speed: 9, life: 0.8, size: 0.16, stretch: 0.5 });
    this.decals.add(p.x, p.z, { type: D.CRACK, size: 8, color: _c.set(0x4de3ff), life: 6, alpha: 0.7 });
    const victims = this.director.enemies.filter(e => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 7 + e.r);
    for (const e of victims) { e.stagger = 1.2; e.releaseToken(); if (!e.boss) { e.liftT = 0.6; e.inner.position.y += 1.2; } }
    for (const q of this.projectiles.eshots) q.life = 0;
    this.after(0.6, () => { for (const e of victims) { if (!e.alive) continue; const dx = e.x - p.x, dz = e.z - p.z; const d = Math.hypot(dx, dz) || 1; if (!e.boss) e.inner.position.y = -e.proto.minY * e.proto.baseScale; e.hurt(e.boss ? Math.max(60, e.maxhp * 0.12) : 60, dx / d, dz / d, false, null); this.particlesAdd.burst(e.x, e.y + e.height * 0.5, e.z, { n: 20, type: P.SPARK, color: _c.set(0x4de3ff), speed: 5, life: 0.5, size: 0.14 }); } this.loop.stopTime(80); this.shake(0.5); this.audio.play('sfx_breaker_hit', { vol: 1 }); }, 'ult');
  }
  // ---------- boss ----------
  bossIntro(b) {
    this.state = 'cine'; this.bossActive = true; this.input.reset(); const th = this.world.THEME; const c = COPY.bosses[th.boss];
    hud.hideUI(true); fxdom.letterbox(true); hud.setWorld(th.name, c.title); this.cine = { kind: 'boss', boss: b, t: 0, dur: 6, a0: b.face + Math.PI - 0.7 };
    this.audio.setMusicMix({ boss: 1, combat: 0.2, bed: 0 }, 1.5); this.audio.play('sfx_' + b.def.voice + '_roar', { vol: 1 }); this.audio.musicDuck(0.05, 1.5);
    if (b.anim) b.anim.play(b.def.clips.scream || b.def.clips.idle, 0.1);
    this.world.env.eyes && this.world.env.eyes(0); this.world.env.lightning && this.world.env.lightning(); this.after(2.6, () => this.world.env.lightning && this.world.env.lightning(), 'boss');
    this.shake(0.6); this.director.alive().forEach(e => { if (!e.boss) e.despawn(); });
    this.after(1.4, () => panels.bossCard(c.name, c.title, c.quote, () => this.audio.play('sfx_thump', { vol: 0.8, minGap: 0.05 })), 'boss');
    this.after(6, () => { fxdom.letterbox(false); hud.hideUI(false); panels.hide(); hud.boss(c.name, c.title); hud.bossHP(1, false); hud.setWorld(th.name, ''); this.state = 'play'; this.cine = null; this.heroLightsOff(); b.beginFight(); this.input.reset(); this.player.cam.init = false; if (th.key === 'sea') this.audio.play('sfx_meg_sub', { vol: 1 }); }, 'boss');
  }
  onBossDeath(b) {
    if (this.state !== 'play' && this.state !== 'wake') return;
    if (this.state === 'wake') { this.cancel(); const p = this.player; p.alive = true; p.dead = false; p.hp = 1; } // trade-kill: the kid earned it
    this.state = 'cine'; this.loop.stopTime(400); this.loop.slowMo(0.2, 1.6); this.shake(1); hud.hideUI(true); fxdom.letterbox(true); this.cine = { kind: 'killcam', boss: b, t: 0, dur: 3.5, a0: this.player.cam.yaw + Math.PI * 0.5 };
    this.audio.play('sfx_boss_death', { vol: 1 }); this.audio.setMusicMix({ bed: 0.5 }, 3); this.input.reset();
    const col = _c.set(b.def.blood); this.particlesAlpha.burst(b.x, b.y + b.height * 0.5, b.z, { n: 120, type: P.CHUNK, color: col, speed: 7, life: 1.6, size: 0.22, gravity: 9, up: 4 }); this.particlesAdd.burst(b.x, b.y + b.height * 0.5, b.z, { n: 100, type: P.SPARK, color: _c.set(0xffffff), speed: 10, life: 1, size: 0.2 });
    for (let i = 0; i < 8; i++) this.decals.splat(b.x + rnd(-3, 3), b.z + rnd(-3, 3), col, 2.5);
    this.world.env.blackout && this.world.env.blackout(0); this.world.env.blackwater && this.world.env.blackwater(0);
    for (const e of this.director.enemies) if (e.alive && !e.boss) e.hurt(9999, 0, 0, false, null);
    const key = this.worldKey; save.data.slain[key] = true; save.data.stats.kills += this.stats.kills; save.write();
    this.after(1.8, () => { hud.stamp(COPY.stamps.slain, 'red'); this.audio.play('sfx_stamp', { vol: 1 }); }, 'kill');
    this.after(4.2, () => this.cleared(), 'kill');
  }
  cleared() {
    this.state = 'cleared'; fxdom.letterbox(false); hud.boss(null); hud.hide(); this.heroLightsOff(); this.bloodT = 0; this.player.hurtT = 0; this.input.unlockMouse(); this.bossActive = false; this.player.anim.play(Math.random() < 0.5 ? 'victory' : 'dance', 0.3); this.cine = { kind: 'victory', t: 0, dur: 10 };
    const p = this.player; this.camera.position.set(p.x + 2.4, 1.4, p.z + 2.6); this.camera.lookAt(p.x, 1.1, p.z); this.cine = null;
    const all = WORLD_ORDER.every(k => save.data.slain[k]); const t = Math.round(this.time - this.stats.t0);
    panels.cleared({ world: this.worldKey, boss: COPY.bosses[this.world.THEME.boss].name, kills: this.stats.kills, headshots: this.stats.headshots, streak: this.stats.streak, time: t, secret: this.stats.secret, all }, a => { if (a === 'again') this.enterWorld(this.worldKey); else if (all) { const vid = this.assets.manifest.groups.home?.find(x => x.type === 'video'); if (vid) this.primeVideo(this.assets.url(vid.url)); this.ending(); } else this.map(); });
    this.audio.play('sfx_victory', { vol: 1 });
  }
  // ---------- wake (fail) ----------
  onPlayerDown(p) {
    if (this.state !== 'play') return;
    this.state = 'wake'; this.input.reset(); this.input.unlockMouse(); this.loop.slowMo(0.3, 1.2); hud.hideUI(true); this.audio.setMusicMix({ bed: 0.3 }, 1); this.audio.play('sfx_gasp', { vol: 1, delay: 0.9 }); save.data.stats.wakes++; save.write();
    this.after(0.9, () => { fxdom.tear(); fxdom.cut(1); }, 'down');
    this.after(1.3, async () => {
      if (this.state !== 'wake') return;
      const wv = this.assets.manifest.groups.wake?.find(a => a.type === 'video');
      hud.hide(); this.renderer.fx.hurt = 0; this.renderer.fx.desat = 0;
      this.bloodT = 0; p.hurtT = 0; hud.low(false);
      if (wv) {
        this.wakeFilm?.dispose();
        const film = showWakeFilm(document.getElementById('app'), this.assets.url(wv.url), {
          muted: this.audio.muted, onVisible: () => fxdom.cut(0)
        });
        this.wakeFilm = film;
        await film.finished;
        if (this.state !== 'wake' || this.wakeFilm !== film) { film.dispose(); return; }
      }
      // A failed download or denied autoplay must still leave a working retry screen.
      this.cine = null; fxdom.cut(0); panels.wake(a => this.onWake(a));
    }, 'down');
  }
  onWake(a) {
    if (this.state !== 'wake') return;
    this.cancel(); this.state = 'loading'; // guard against double taps
    panels.hide(); this.wakeFilm?.dispose(); this.wakeFilm = null;
    this.clearHome(); this.restoreScene(); this.input.reset();
    this.loop.timeScale = 1; this.paused = false;
    if (a === 'retry') this.enterWorld(this.worldKey); // restart this level from wave one
    else this.map();
  }
  // ---------- ending ----------
  async ending() {
    this.state = 'ending'; panels.hide(); hud.hide(); hud.reset && hud.reset(); hud.boss(null); fxdom.fade(1, 800); await new Promise(r => setTimeout(r, 900));
    const vid = this.assets.manifest.groups.home?.find(a => a.type === 'video'); this.audio.stopMusic(2);
    if (vid) { const ok = await this.playVideo(this.assets.url(vid.url)); if (ok) { await this.assets.loadGroup('home'); this.audio.setMusic({ bed: 'ending' }, 1); return this.finalCard(); } }
    // in-engine fallback: Knox asleep in his own bed, trophies on the wall
    await this.assets.loadGroup('home'); this.unloadWorld(); const W = WORLDS.home; const env = W.build(this.ctx, this.renderer.tier); this.scene.add(env.group); this.world = { key: 'home', THEME: W.THEME, env }; env.trophies && env.trophies(3); this.sky.apply(W.THEME.sky); this.lighting.apply(W.THEME.rig); this.renderer.fx.underwater = 0; this.sky.uniforms.underwater.value = 0; this.audio.setWorldFilter(false); this.audio.setMusic({ bed: 'ending' }, 1);
    const p = this.player; const bed = env.bedPos || { x: 0, y: 0.5, z: 0 }; p.anim.stopAll(); p.anim.play('sleep', 0); this.poseOnBed(p, bed); p.gear.setVisible(false); p.lampOn = false; this.lighting.setLamp(p.root.position, _v.set(0, 0, 1), false);
    this.cine = { kind: 'ending', t: 0, dur: 14 }; fxdom.fade(0, 2500);
    const lines = COPY.final.lines; for (let i = 0; i < lines.length; i++) { await new Promise(r => setTimeout(r, 3200)); hud.show(); hud.hideUI(true); hud.banner(lines[i], 'small'); }
    await new Promise(r => setTimeout(r, 3500)); this.finalCard();
  }
  // lay Knox on the bed: head toward the pillow (-z), lowest skinned vertex on the sheet
  // pin the body to a height by its hips, whatever vertical offset the current clip bakes in
  anchorHips(p, targetY) {
    const h = p.bones && p.bones.Hips; if (!h) return;
    p.root.updateMatrixWorld(true); const w = h.getWorldPosition(new THREE.Vector3());
    p.root.position.y += targetY - w.y; p.root.updateMatrixWorld(true);
  }
  poseOnBed(p, bed, lift = 0, yaw = null) {
    p.root.position.set(bed.x, bed.y, bed.z); p.root.rotation.y = 0; p.root.updateMatrixWorld(true); p.anim.update(0.001); p.root.updateMatrixWorld(true);
    const head = p.bones.Head ? p.bones.Head.getWorldPosition(new THREE.Vector3()) : null, hips = p.bones.Hips ? p.bones.Hips.getWorldPosition(new THREE.Vector3()) : null;
    // deriving the yaw from head-vs-hips only works once a LYING pose is actually playing; mid-crossfade
    // the axis is vertical and atan2 returns noise, which laid him sideways across the bed.
    if (yaw !== null) { p.root.rotation.y = yaw; p.root.updateMatrixWorld(true); }
    else if (head && hips && Math.hypot(head.x - hips.x, head.z - hips.z) > 0.25) { const ang = Math.atan2(head.x - hips.x, head.z - hips.z); p.root.rotation.y = Math.PI - ang; p.root.updateMatrixWorld(true); }
    else { p.root.rotation.y = Math.PI; p.root.updateMatrixWorld(true); }
    const box = new THREE.Box3(); let minY = Infinity; p.root.traverse(o => { if (o.isSkinnedMesh) { box.setFromObject(o, true); minY = Math.min(minY, box.min.y); } });
    if (isFinite(minY)) p.root.position.y += bed.y - minY + 0.02 + lift; p.root.updateMatrixWorld(true);
  }
  finalCard() { hud.hide(); panels.victory(a => { if (a === 'reset') { save.data.slain = {}; save.write(); this.state = 'map'; this.loadWorld('forest').then(() => this.title()); } else this.ending(); }); }
  primeVideo(url) { const v = document.createElement('video'); v.src = url; v.playsInline = true; v.preload = 'auto'; v.muted = false; v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:15;opacity:0'; document.getElementById('app').appendChild(v); this._primed = { v, p: v.play().catch(() => null) }; return this._primed; }
  playVideo(url) { return new Promise(res => { const pre = this._primed; this._primed = null; const v = pre ? pre.v : document.createElement('video'); if (!pre) { v.src = url; v.playsInline = true; } v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:15'; v.muted = false; if (!pre) document.getElementById('app').appendChild(v); let done = false; let wd = 0; const end = ok => { if (done) return; done = true; clearTimeout(wd); v.remove(); res(ok); }; v.onended = () => end(true); v.onerror = () => end(false); /* Watchdog: if 'ended' never arrives -- a stalled decode, a tab backgrounded mid-clip -- the player is left on a frozen frame with the game awaiting a promise that will never settle. Losing a level is exactly when that must not happen, so give up after the clip's own length plus slack. */ const arm = () => { clearTimeout(wd); const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 20; wd = setTimeout(() => end(true), (d + 2) * 1000); }; v.onloadedmetadata = arm; arm(); (pre ? pre.p.then(() => { if (v.paused) throw new Error('blocked'); }) : v.play()).then(() => { fxdom.cut(0); const skip = () => end(true); v.addEventListener('pointerdown', skip); }).catch(() => end(false)); }); }
}
