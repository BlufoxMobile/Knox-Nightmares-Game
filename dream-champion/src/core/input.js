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
    // Floating stick geometry + response. Tuned for a kid's thumb on a phone: short travel to full speed,
    // linear (not expo) curve, full tilt reached at 78% of the ring so the rim is never a requirement.
    this.stickR = 46; this.dead = 0.08; this.curve = 1.0; this.fullAt = 0.78;
    // Touch-only look gain (mouse/gamepad unchanged). 2.0, not 1.6: a right thumb starts its sweep on or
    // beside BLAST (x~782 of 852) and can only reach the midline, so the usable stroke is ~356 px. At 1.6
    // that bought 91deg -- under a quarter turn, so glancing over his shoulder always cost two sweeps. At
    // 2.0 the same stroke covers 114deg, and the LOOK SPEED setting still scales it 0.7x / 1x / 1.4x.
    this.lookScaleX = 2.0; this.lookScaleY = 1.15;
    this.tapSlop = 8; this.tapMax = 22; this.tapMs = 320; // camera ignores the first tapSlop px; a touch still
                                                   // counts as a tap-to-target while it drifts under tapMax
    this.btnSlop = 20;                             // px a finger may wander on an action button before the
                                                   // press is undone and the finger becomes a look-drag
    this.dashBuf = 220;                            // ms of dash-press buffering (was 150)
    this.enabled = true;
    this.lefty = !!save.data.settings.lefty;
    this._bind();
  }
  _zone(x, y) {
    // Straight 50/50 split: the half of the screen under the movement thumb is ALWAYS the stick.
    // (was 42% / 58% — a thumb resting just past the middle silently became a camera drag)
    const w = innerWidth; const left = this.lefty ? x > w * 0.5 : x < w * 0.5;
    return left ? 'move' : 'look';
  }
  _bind() {
    const app = this.app;
    const btn = (id, down, up, undo) => {
      const el = $(id); let pid = -1, ox = 0, oy = 0;
      const rel = e => { if (e && e.pointerId != null && pid !== -1 && e.pointerId !== pid) return; if (!el.classList.contains('down')) return; pid = -1; el.classList.remove('down'); up && up(e); };
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        pid = e.pointerId; ox = e.clientX; oy = e.clientY; el.classList.add('down'); this.touchActive = e.pointerType !== 'mouse';
        down(e); this.anyQ = true;                                   // act FIRST: a capture failure must never eat a press
        try { el.setPointerCapture(e.pointerId); } catch (_) { }     // throws (NotFoundError) on some iOS pointer states
      });
      // Hand a sweeping button finger to look without a camera jump. BLAST keeps
      // firing during the drag; one right thumb can shoot and aim simultaneously.
      el.addEventListener('pointermove', e => {
        if (pid === -1 || e.pointerId !== pid || e.pointerType === 'mouse') return;
        if (Math.hypot(e.clientX - ox, e.clientY - oy) <= this.btnSlop) return;
        // BLAST doubles as a look surface: dragging aims WITHOUT releasing fire.
        // Dash/Breaker still cancel their buffered action when handed to look.
        if (id === 'bFire') { this._adoptLook(e); return; }
        rel(e); undo && undo(); this._adoptLook(e);
      });
      el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('lostpointercapture', rel);
      // failsafe: if capture was refused the release lands on some other element — never leave a button stuck on
      addEventListener('pointerup', e => { if (pid !== -1 && e.pointerId === pid) rel(e); }, true);
      addEventListener('pointercancel', e => { if (pid !== -1 && e.pointerId === pid) rel(e); }, true);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    // third arg: undo the queued action when the press turns out to be a turn. Dash and the Breaker are
    // buffered edges, so cancelling the buffer costs the player nothing if the frame has not read it yet.
    btn('bFire', () => { this.fireHeld = true; this.fireTap = true; this.fireHoldT = 0; }, () => { this.fireHeld = false; }, () => { this.fireTap = false; });
    btn('bDash', () => { this.dashQ = this.dashBuf; }, null, () => { this.dashQ = 0; });
    btn('bUlt', () => { this.ultQ = true; }, null, () => { this.ultQ = false; });
    $('bPause').addEventListener('pointerdown', e => { e.stopPropagation(); this.pauseQ = true; });
    $('bMute').addEventListener('pointerdown', e => { e.stopPropagation(); this.muteQ = true; });

    app.addEventListener('pointerdown', e => {
      if (!this.enabled) return; if (e.target.closest('button,#ov,.panel')) return;
      e.preventDefault(); this.anyQ = true;
      if (e.pointerType === "mouse") { this.touchActive = false; if (e.button === 0) { this.fireHeld = true; this.fireTap = true; this.fireHoldT = 0; this.mouseDown = true; } else if (e.button === 2) { this.dashQ = this.dashBuf; } this._mouse = { x: e.clientX, y: e.clientY }; return; }
      this.touchActive = true; document.body.classList.remove('nokb');
      const zone = this._zone(e.clientX, e.clientY);
      const hasMove = [...this.pointers.values()].some(p => p.zone === 'move');
      // a SECOND finger in the move half is ignored, not promoted to a camera drag
      // (a resting thumb / palm on the left used to yank the camera around)
      const z = zone === 'move' ? (hasMove ? 'none' : 'move') : 'look';
      const p = { id: e.pointerId, zone: z, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, drift: 0, slip: false, lastY: e.clientY, lastT: performance.now() };
      this.pointers.set(e.pointerId, p);
      try { app.setPointerCapture(e.pointerId); } catch (_) { }
      if (p.zone === 'move') this._stickShow(p);
      // two-finger tap => dash
      // a finger handed over from a button is mid-gesture, not a fresh tap: it must not pair with this one
      const looks = [...this.pointers.values()].filter(q => q.zone === 'look' && !q.adopted);
      if (looks.length >= 2 && (performance.now() - looks[0].t) < 250) { this.dashQ = this.dashBuf; looks.forEach(q => q.consumed = true); }
    });
    app.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') { if (document.pointerLockElement === app) { this.look.dx += e.movementX; this.look.dy += e.movementY; } else if (this._mouse && this.mouseDown === false && false) { } this._mouse = { x: e.clientX, y: e.clientY }; return; }
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.zone === 'move') { p.x = e.clientX; p.y = e.clientY; this._stickUpdate(p); }
      else if (p.zone === 'look') {
        // tap slop: the first few px never move the camera, so tap-to-target doesn't jitter the aim
        const drift = Math.hypot(e.clientX - p.ox, e.clientY - p.oy); if (drift > p.drift) p.drift = drift;
        if (!p.slip && drift > this.tapSlop) p.slip = true;
        if (p.slip) { this.look.dx += dx * this.lookScaleX; this.look.dy += dy * this.lookScaleY; }
        p.x = e.clientX; p.y = e.clientY;
        // quick swipe down => dash (deliberate flick only; a lazy drag down must not burn a dash charge)
        const now = performance.now(); if (e.clientY - p.oy > 120 && now - p.t < 130 && !p.swiped) { p.swiped = true; this.dashQ = this.dashBuf; }
      } else { p.x = e.clientX; p.y = e.clientY; }
    });
    const end = e => {
      if (e.pointerType === 'mouse') { if (e.button === 0) { this.fireHeld = false; this.mouseDown = false; } return; }
      const p = this.pointers.get(e.pointerId); if (!p) return; this.pointers.delete(e.pointerId);
      if (p.zone === 'move') { this.move.x = 0; this.move.y = 0; this.stickEl.classList.remove('on'); }
      // the release point counts toward drift too (a finger can jump on lift-off)
      else if (p.zone === 'look') { const d2 = Math.hypot(e.clientX - p.ox, e.clientY - p.oy); if (d2 > p.drift) p.drift = d2; }
      // tap-to-target: judged by how far the finger DRIFTED (p.slip), not by accumulated path length —
      // a wobbly thumb tap used to fail at ~10px of jitter
      if (e.type === 'pointerup' && p.zone === 'look' && !p.consumed && p.drift < this.tapMax && performance.now() - p.t < this.tapMs) { this.tap = { x: p.ox, y: p.oy }; }
    };
    app.addEventListener('pointerup', end); app.addEventListener('pointercancel', end); app.addEventListener('lostpointercapture', end);
    app.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => {
      if (e.repeat) return; this.kb.add(e.code); document.body.classList.add('nokb'); this.anyQ = true;
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQ = this.dashBuf;
      if (e.code === 'KeyQ' || e.code === 'KeyE') this.ultQ = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQ = true;
      if (e.code === 'KeyM') this.muteQ = true;
      if (e.code === 'Space' && !e.target.closest('input')) e.preventDefault();
    });
    addEventListener('keyup', e => this.kb.delete(e.code));
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }
  // Adopt a finger that started on a button into the look zone. Its origin is where it is NOW, not where it
  // touched down, so the handoff contributes zero camera motion; slip is already spent and consumed/swiped
  // are pre-set so the stroke can never also register as a tap-to-target or burn the swipe-down dash.
  _adoptLook(e) {
    if (this.pointers.has(e.pointerId)) return;
    const t = performance.now();
    this.pointers.set(e.pointerId, { id: e.pointerId, zone: 'look', adopted: true, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t, moved: 0, drift: 0, slip: true, consumed: true, swiped: true, lastY: e.clientY, lastT: t });
  }
  _stickShow(p) {
    const r = this.stickR, el = this.stickEl, k = Math.round(r * 0.8);
    // keep the drawn ring exactly the size of the live radius, whatever stickR is tuned to
    el.style.width = el.style.height = (r * 2) + 'px'; el.style.margin = `${-r}px 0 0 ${-r}px`;
    this.knob.style.width = this.knob.style.height = k + 'px'; this.knob.style.margin = `${-k / 2}px 0 0 ${-k / 2}px`;
    el.classList.add('on'); el.style.left = p.ox + 'px'; el.style.top = p.oy + 'px'; this.knob.style.transform = 'translate(0,0)';
  }
  _stickUpdate(p) {
    let dx = p.x - p.ox, dy = p.y - p.oy; const r = this.stickR; let m = Math.hypot(dx, dy);
    if (m > r) { dx *= r / m; dy *= r / m; m = r; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    let n = m / r; n = n < this.dead ? 0 : Math.pow((n - this.dead) / (1 - this.dead), this.curve); n = clamp(n / this.fullAt, 0, 1);
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
      const dash = b(0) || b(1) || b(4) || b(6); if (dash && !this._gpDash) this.dashQ = this.dashBuf; this._gpDash = dash;
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
