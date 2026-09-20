// Input: floating move stick (left zone), drag-to-look (right zone), pointer-captured buttons, keyboard, gamepad.
import { clamp } from './math.js';
import { save } from './save.js';

const $ = id => document.getElementById(id);
const isTouchDevice = () => (navigator.maxTouchPoints || 0) > 0;

export class Input {
  constructor(app) {
    this.app = app;
    this.move = { x: 0, y: 0 };            // -1..1 (x right, y forward)
    this.look = { dx: 0, dy: 0 };          // accumulated pixels since last consume
    this.fireHeld = false; this.fireTap = false; this.fireHoldT = 0;
    this.dashQ = 0;                         // buffered dash presses (ms remaining)
    this.ultQ = false; this.pauseQ = false; this.anyQ = false;
    this.tap = null;                        // {x,y} tap-to-target in screen px
    this.touchActive = false;               // true once a touch pointer is used
    this.kb = new Set();
    this.pointers = new Map();
    this.stickEl = $('stick'); this.knob = this.stickEl.firstElementChild;
    this.stickR = 58; this.dead = 0.1;
    this.enabled = true;
    this.lefty = !!save.data.settings.lefty;
    this._bind();
  }
  _zone(x, y) {
    const w = innerWidth; const left = this.lefty ? x > w * 0.58 : x < w * 0.42;
    return left ? 'move' : 'look';
  }
  _bind() {
    const app = this.app;
    const btn = (id, down, up) => {
      const el = $(id);
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('down'); this.touchActive = e.pointerType !== 'mouse'; down(e); this.anyQ = true; });
      const rel = e => { el.classList.remove('down'); up && up(e); };
      el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('lostpointercapture', rel);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    btn('bFire', () => { this.fireHeld = true; this.fireTap = true; this.fireHoldT = 0; }, () => { this.fireHeld = false; });
    btn('bDash', () => { this.dashQ = 150; });
    btn('bUlt', () => { this.ultQ = true; });
    $('bPause').addEventListener('pointerdown', e => { e.stopPropagation(); this.pauseQ = true; });
    $('bMute').addEventListener('pointerdown', e => { e.stopPropagation(); this.muteQ = true; });

    app.addEventListener('pointerdown', e => {
      if (!this.enabled) return; if (e.target.closest('button,#ov,.panel')) return;
      e.preventDefault(); this.anyQ = true;
      if (e.pointerType === 'mouse') { this.touchActive = false; if (e.button === 0) { this.fireHeld = true; this.fireTap = true; this.fireHoldT = 0; this.mouseDown = true; } else if (e.button === 2) { this.dashQ = 150; } this._mouse = { x: e.clientX, y: e.clientY }; return; }
      this.touchActive = true; document.body.classList.remove('nokb');
      const zone = this._zone(e.clientX, e.clientY);
      const hasMove = [...this.pointers.values()].some(p => p.zone === 'move');
      const p = { id: e.pointerId, zone: zone === 'move' && !hasMove ? 'move' : 'look', ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, lastY: e.clientY, lastT: performance.now() };
      this.pointers.set(e.pointerId, p);
      try { app.setPointerCapture(e.pointerId); } catch (_) { }
      if (p.zone === 'move') this._stickShow(p);
      // two-finger tap => dash
      const looks = [...this.pointers.values()].filter(q => q.zone === 'look');
      if (looks.length >= 2 && (performance.now() - looks[0].t) < 250) { this.dashQ = 150; looks.forEach(q => q.consumed = true); }
    });
    app.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') { if (document.pointerLockElement === app) { this.look.dx += e.movementX; this.look.dy += e.movementY; } else if (this._mouse && this.mouseDown === false && false) { } this._mouse = { x: e.clientX, y: e.clientY }; return; }
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.zone === 'move') { p.x = e.clientX; p.y = e.clientY; this._stickUpdate(p); }
      else {
        this.look.dx += dx; this.look.dy += dy; p.x = e.clientX; p.y = e.clientY;
        // quick swipe down => dash
        const now = performance.now(); if (e.clientY - p.oy > 90 && now - p.t < 140 && !p.swiped) { p.swiped = true; this.dashQ = 150; }
      }
    });
    const end = e => {
      if (e.pointerType === 'mouse') { if (e.button === 0) { this.fireHeld = false; this.mouseDown = false; } return; }
      const p = this.pointers.get(e.pointerId); if (!p) return; this.pointers.delete(e.pointerId);
      if (p.zone === 'move') { this.move.x = 0; this.move.y = 0; this.stickEl.classList.remove('on'); }
      else if (!p.consumed && p.moved < 10 && performance.now() - p.t < 220) { this.tap = { x: p.ox, y: p.oy }; }
    };
    app.addEventListener('pointerup', end); app.addEventListener('pointercancel', end);
    app.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => {
      if (e.repeat) return; this.kb.add(e.code); document.body.classList.add('nokb'); this.anyQ = true;
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQ = 150;
      if (e.code === 'KeyQ' || e.code === 'KeyE') this.ultQ = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQ = true;
      if (e.code === 'KeyM') this.muteQ = true;
      if (e.code === 'Space' && !e.target.closest('input')) e.preventDefault();
    });
    addEventListener('keyup', e => this.kb.delete(e.code));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }
  _stickShow(p) { this.stickEl.classList.add('on'); this.stickEl.style.left = p.ox + 'px'; this.stickEl.style.top = p.oy + 'px'; this.knob.style.transform = 'translate(0,0)'; }
  _stickUpdate(p) {
    let dx = p.x - p.ox, dy = p.y - p.oy; const r = this.stickR; let m = Math.hypot(dx, dy);
    if (m > r) { dx *= r / m; dy *= r / m; m = r; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    let n = m / r; n = n < this.dead ? 0 : Math.pow((n - this.dead) / (1 - this.dead), 1.3); n = clamp(n / 0.85, 0, 1);
    if (m > 0) { this.move.x = dx / m * n; this.move.y = -dy / m * n; } else { this.move.x = 0; this.move.y = 0; }
  }
  reset() { this.move.x = this.move.y = 0; this.look.dx = this.look.dy = 0; this.fireHeld = false; this.pointers.clear(); this.stickEl.classList.remove('on'); this.kb.clear(); this.mouseDown = false; document.querySelectorAll('#ctl button').forEach(b => b.classList.remove('down')); }
  // called once per frame by the game; returns a snapshot, consumes edge triggers
  poll(dt) {
    const s = this.state || (this.state = { mx: 0, my: 0, ldx: 0, ldy: 0, fire: false, fireTap: false, fireHold: 0, dash: false, ult: false, pause: false, mute: false, tap: null, any: false, kb: false, gp: false });
    let mx = this.move.x, my = this.move.y;
    const k = this.kb; let kx = 0, ky = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) ky += 1; if (k.has('KeyS') || k.has('ArrowDown')) ky -= 1; if (k.has('KeyD') || k.has('ArrowRight')) kx += 1; if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; s.kb = true; }
    // gamepad
    const gps = navigator.getGamepads ? navigator.getGamepads() : []; const gp = gps && gps[0];
    if (gp) {
      const ax = gp.axes[0] || 0, ay = -(gp.axes[1] || 0); if (Math.hypot(ax, ay) > 0.18) { mx = ax; my = ay; s.gp = true; }
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0; if (Math.abs(rx) > 0.15) this.look.dx += rx * 900 * dt; if (Math.abs(ry) > 0.15) this.look.dy += ry * 600 * dt;
      const b = i => gp.buttons[i] && gp.buttons[i].pressed;
      const fire = b(7) || b(5); if (fire && !this._gpFire) { this.fireTap = true; this.fireHoldT = 0; } this._gpFire = fire; if (fire) this.fireHeld = true; else if (this._gpFireHeld) this.fireHeld = false; this._gpFireHeld = fire;
      const dash = b(0) || b(1) || b(4) || b(6); if (dash && !this._gpDash) this.dashQ = 150; this._gpDash = dash;
      const ult = b(2) || b(3); if (ult && !this._gpUlt) this.ultQ = true; this._gpUlt = ult;
      const pause = b(9); if (pause && !this._gpPause) this.pauseQ = true; this._gpPause = pause;
      if (fire || dash || ult) this.anyQ = true;
    }
    s.mx = mx; s.my = my; s.ldx = this.look.dx; s.ldy = this.look.dy; this.look.dx = this.look.dy = 0;
    s.fire = this.fireHeld; s.fireTap = this.fireTap; this.fireTap = false; if (this.fireHeld) this.fireHoldT += dt; s.fireHold = this.fireHoldT;
    s.dash = this.dashQ > 0; if (this.dashQ > 0) this.dashQ -= dt * 1000;
    s.ult = this.ultQ; this.ultQ = false; s.pause = this.pauseQ; this.pauseQ = false; s.mute = this.muteQ; this.muteQ = false;
    s.tap = this.tap; this.tap = null; s.any = this.anyQ; this.anyQ = false;
    return s;
  }
  consumeDash() { this.dashQ = 0; }
  setLefty(v) { this.lefty = v; document.getElementById('ctl').classList.toggle('left', v); }
  lockMouse() { if (!isTouchDevice() && this.app.requestPointerLock) this.app.requestPointerLock({ unadjustedMovement: true }).catch?.(() => { }); }
  unlockMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
}
export { isTouchDevice };
