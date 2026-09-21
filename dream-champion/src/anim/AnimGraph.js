// Animation state machine with crossfades, upper/lower body layering via track masks, one-shots and additive recoil.
import * as THREE from 'three';

const UPPER = new Set(['Spine01', 'Spine02', 'neck', 'Head', 'head_end', 'headfront', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftHandIndex1', 'RightHandIndex1']);
const boneOf = t => t.name.split('.')[0].replace(/^.*\|/, '');

export function maskClip(clip, keepUpper, suffix) {
  const tracks = clip.tracks.filter(t => { const upper = UPPER.has(boneOf(t)); return keepUpper ? upper : !upper; });
  const c = new THREE.AnimationClip(clip.name + suffix, clip.duration, tracks, clip.blendMode); c.userData = clip.userData; return c;
}

export class AnimGraph {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root); this.clips = {}; this.actions = {}; this.current = null; this.upper = null; this.oneShot = null;
    for (const c of clips) { this.clips[c.name] = c; }
    this.mixer.addEventListener('finished', e => { if (this.oneShot && e.action === this.oneShot.action) { const cb = this.oneShot.cb; this.oneShot = null; cb && cb(); } if (this.upShot && e.action === this.upShot.action) { this.upShot.action.fadeOut(0.15); this.upShot = null; } });
  }
  has(n) { return !!this.clips[n]; }
  action(name, opts = {}) {
    const key = name + (opts.mask || '');
    // A cached action that stopAll() (-> mixer.stopAllAction) has stopped is DEACTIVATED: the mixer stops
    // ticking it, so reset()/fadeIn()/setEffectiveWeight() on it do nothing at all and the skeleton freezes
    // in whatever pose it last held. Every base clip (idle/combat_idle/run_gun/...) is created once at boot
    // and then re-fetched from this cache, so after the first stopAll the ONLY thing still driving bones was
    // the upper-body overlay -- the legs had no track writing to them. Re-arm the action before handing it back.
    const hit = this.actions[key];
    if (hit) { if (!hit.isRunning()) { hit.enabled = true; hit.paused = false; hit.setEffectiveWeight(0); hit.play(); } return hit; }
    let clip = this.clips[name]; if (!clip) return null;
    if (opts.mask === 'upper') clip = maskClip(clip, true, '_U'); else if (opts.mask === 'lower') clip = maskClip(clip, false, '_L');
    const a = this.mixer.clipAction(clip); a.enabled = true; a.setEffectiveWeight(0); a.play();
    const loop = clip.userData?.loop ?? opts.loop ?? true; a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    this.actions[key] = a; return a;
  }
  // full-body base state (locomotion, idle, swim...) with crossfade
  play(name, fade = 0.2, opts = {}) {
    const a = this.action(name, opts); if (!a) return null;
    if (this.current === a) return a;
    if (this.current) { a.reset(); a.setEffectiveWeight(1); a.setEffectiveTimeScale(opts.timeScale ?? 1); this.current.crossFadeTo(a, fade, true); } else { a.reset(); a.setEffectiveWeight(1); a.fadeIn(fade); }
    this.current = a; return a;
  }
  // upper-body overlay (aim pose) with weight
  setUpper(name, weight, fade = 0.12) {
    const a = name ? this.action(name, { mask: 'upper' }) : null;
    if (this.upper && this.upper !== a) { this.upper.fadeOut(fade); }
    if (a) { if (this.upper !== a) { a.reset(); a.fadeIn(fade); } a.setEffectiveWeight(weight); }
    this.upper = a;
  }
  // one-shot full body (roll, hit, knockdown...) : suspends base while playing
  shot(name, cb, fade = 0.06, opts = {}) {
    const a = this.action(name, { loop: false }); if (!a) { cb && cb(); return null; }
    if (this.oneShot) { this.oneShot.action.fadeOut(0.05); }
    a.reset(); a.setEffectiveWeight(1); a.setEffectiveTimeScale(opts.timeScale ?? 1); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = !!opts.hold; a.fadeIn(fade);
    if (this.current) this.current.fadeOut(fade);
    this.oneShot = { action: a, cb: () => { if (!opts.hold) { if (this.current) { this.current.reset(); this.current.fadeIn(0.18); } a.fadeOut(0.18); } cb && cb(); } };
    return a;
  }
  // upper-body one-shot (fire, throw) played additively on top
  upperShot(name, fade = 0.04, timeScale = 1) {
    const a = this.action(name, { mask: 'upper', loop: false }); if (!a) return null;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.setEffectiveWeight(1); a.setEffectiveTimeScale(timeScale); a.fadeIn(fade); this.upShot = { action: a }; return a;
  }
  update(dt) { this.mixer.update(dt); }
  // stopAll deactivates every action; action() re-arms them on the next fetch. Zero the weights here so a
  // re-armed action can never come back at a stale weight before its caller sets one.
  stopAll() { this.mixer.stopAllAction(); for (const k in this.actions) { this.actions[k].setEffectiveWeight(0); } this.current = null; this.upper = null; this.oneShot = null; this.upShot = null; }
}
