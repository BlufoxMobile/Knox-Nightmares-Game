// Gameplay HUD. Drives the DOM already in index.html (#hud). Every setter caches its last value and
// touches the DOM only when something actually changed. Animations that must re-trigger reliably
// (hitmarker, banner, stamp, damage numbers, direction arcs) alternate between two identical keyframe
// classes ("a"/"b") instead of forcing a reflow.
import { COPY } from '../game/data/copy.js';

const $ = id => document.getElementById(id);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const DN_POOL = 12;      // damage numbers on screen (review 2.5: cap 12, recycle oldest)
const DD_POOL = 4;       // simultaneous direction arcs
const TH_POOL = 6;       // off-screen threat markers (the nearest monster was off screen 38-64% of the time)
const FEED_MAX = 4;

let el = null;           // element cache, filled by init()
let timers = {};         // named timeouts (hurt, bossflash, vignette...)
const last = {           // last written values
  hp: -1, hpMax: -1, segs: -1, heartbeat: null,
  kills: null, streakMult: null, streakFrac: -1, streakOn: null,
  ult: -1, ultReady: null, dashCharges: -1, dashMax: -1,
  world: null, objective: null, reticle: null, ghost: null, ghostOn: null,
  bossName: null, bossSub: null, bossOn: null, bossFrac: -1,
  low: null, touch: null, lefty: null, shown: null, hideui: null, retX: 0, retY: 0,
};
let dnPool = [], dnHead = 0;
let ddPool = [], ddHead = 0;
let thPool = [], thMap = new Map();   // marker slots; enemy -> slot
let flip = { hit: 0, banner: 0, stamp: 0, pickup: 0, bump: 0 };

function init() {
  if (el) return el;
  el = {
    hud: $('hud'), reticle: $('reticle'), hitmark: $('hitmark'), dmgnums: $('dmgnums'), dmgdir: $('dmgdir'),
    vignette: $('vignette'), hpbar: $('hpbar'), hpwrap: $('hpwrap'), hplabel: $('hplabel'), kills: $('kills'),
    streakwrap: $('streakwrap'), streak: $('streak'), streakbar: $('streakbar')?.firstElementChild,
    worldname: $('worldname'), objective: $('objective'),
    bossbar: $('bossbar'), bossname: $('bossname'), bosssub: $('bosssub'), bossfill: $('bossfill'),
    banner: $('banner'), stamp: $('stamp'), killfeed: $('killfeed'), pickup: $('pickupmsg'), ghost: $('ghost'),
    ctl: $('ctl'), stick: $('stick'), bDash: $('bDash'), bUlt: $('bUlt'), ultfill: $('ultfill'),
  };
  el.hpSegs = el.hpbar ? Array.from(el.hpbar.children) : [];
  el.dashPips = el.bDash ? el.bDash.querySelector('em') : null;
  if (el.hplabel && !el.hplabel.textContent) el.hplabel.textContent = COPY.banners.low;
  // pooled damage numbers
  if (el.dmgnums) {
    for (let i = 0; i < DN_POOL; i++) { const d = document.createElement('div'); d.className = 'dn'; d.style.opacity = '0'; el.dmgnums.appendChild(d); dnPool.push(d); }
  }
  // pooled direction arcs
  if (el.dmgdir) {
    for (let i = 0; i < DD_POOL; i++) {
      const d = document.createElement('div'); d.className = 'dd'; d.style.opacity = '0';
      // arc at the top of the screen; the parent rotates it around the screen centre
      d.innerHTML = '<i><svg viewBox="0 0 200 80" aria-hidden="true"><defs><linearGradient id="ddg' + i + '" x1="0" x2="1"><stop offset="0" stop-color="#ff2438" stop-opacity="0"/><stop offset=".35" stop-color="#ff2438"/><stop offset=".65" stop-color="#ff2438"/><stop offset="1" stop-color="#ff2438" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="M8 76A100 100 0 0 1 192 76" fill="none" stroke="url(#ddg' + i + ')" stroke-width="18" opacity=".35"/><path d="M8 76A100 100 0 0 1 192 76" fill="none" stroke="url(#ddg' + i + ')" stroke-width="6"/></svg></i>';
      el.dmgdir.appendChild(d); ddPool.push(d);
    }
  }
  if (el.killfeed) el.killfeed.addEventListener('animationend', e => { if (e.target.parentNode === el.killfeed) e.target.remove(); });
  // pooled threat markers: a chevron on an ellipse just inside the screen edge, pointing at the monster.
  // Built here (container + style) so the HUD markup and stylesheet stay untouched; sits under #vignette.
  if (el.dmgdir && !$('threats')) {
    const st = document.createElement('style'); st.textContent = '#threats{position:absolute;inset:0}.th{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;will-change:transform}.th i{position:absolute;left:-14px;top:-14px;width:28px;height:28px;filter:drop-shadow(0 0 5px rgba(255,36,56,.85))}.th i svg{display:block;width:100%;height:100%;overflow:visible}.th.near i{animation:thnear .5s ease-in-out infinite alternate}.th.boss i{filter:drop-shadow(0 0 6px rgba(255,207,74,.9))}@keyframes thnear{from{transform:scale(1)}to{transform:scale(1.28)}}';
    document.head.appendChild(st);
    const wrap = document.createElement('div'); wrap.id = 'threats'; el.dmgdir.parentNode.insertBefore(wrap, el.dmgdir.nextSibling); el.threats = wrap;
    for (let i = 0; i < TH_POOL; i++) {
      const d = document.createElement('div'); d.className = 'th';
      d.innerHTML = '<i><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M6 19 14 7l8 12" fill="none" stroke="#ff2438" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".28"/><path d="M6 19 14 7l8 12" fill="none" stroke="#ff2438" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i>';
      wrap.appendChild(d); thPool.push({ el: d, e: null, a: 9, s: 0, o: 0, near: null, boss: null });
    }
  }
  return el;
}

// Re-trigger a one-shot CSS animation by alternating two classes with identical keyframes.
function retrigger(node, key, extra) {
  flip[key] ^= 1;
  node.className = (extra ? extra + ' ' : '') + (flip[key] ? 'on b' : 'on a');
}
function timer(name, ms, fn) { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); }

export const hud = {
  init,
  get el() { return init(); },

  show() { init(); if (last.shown !== true) { last.shown = true; el.hud.classList.remove('hidden'); } },
  hide() { init(); if (last.shown !== false) { last.shown = false; el.hud.classList.add('hidden'); } },
  // cinematic: keep the world visible but drop the chrome (letterbox moments)
  hideUI(on) { init(); on = !!on; if (last.hideui !== on) { last.hideui = on; el.hud.classList.toggle('hideui', on); } },

  // ---- health --------------------------------------------------------------------------------------------
  setHP(hp, max = 100, hurt = false) {
    init();
    hp = Math.max(0, hp);
    const n = el.hpSegs.length || 5;
    const segs = hp <= 0 ? 0 : Math.max(1, Math.ceil((hp / max) * n - 1e-6));
    if (segs !== last.segs) {
      last.segs = segs;
      for (let i = 0; i < n; i++) el.hpSegs[i].classList.toggle('off', i >= segs);
    }
    const heartbeat = hp > 0 && hp / max < 0.4;
    if (heartbeat !== last.heartbeat) { last.heartbeat = heartbeat; el.hpwrap.classList.toggle('heartbeat', heartbeat); }
    if (hurt) {
      // review 2.5: bar flashes white; red vignette 0.35 for 120 ms then 0.15 for 0.8 s
      el.hpbar.classList.add('hurt'); timer('hurt', 140, () => el.hpbar.classList.remove('hurt'));
      el.vignette.style.opacity = '0.35';
      timer('vig1', 120, () => { el.vignette.style.opacity = '0.15'; timer('vig2', 800, () => { el.vignette.style.opacity = '0'; }); });
    }
    last.hp = hp; last.hpMax = max;
  },
  // damage vignette alpha (game may drive it directly, e.g. poison / underwater)
  vignette(a) { init(); el.vignette.style.opacity = String(clamp01(a)); },

  // ---- score ---------------------------------------------------------------------------------------------
  setKills(n) { init(); n |= 0; if (n !== last.kills) { last.kills = n; el.kills.textContent = String(n); } },

  setStreak(mult, frac = 1, shatter = false) {
    init();
    mult = Math.max(1, mult | 0); frac = clamp01(frac);
    if (shatter) {
      last.streakMult = null; last.streakFrac = -1; last.streakOn = true;
      el.streakwrap.classList.add('on', 'shatter'); el.streak.textContent = '×' + mult;
      timer('shatter', 520, () => { el.streakwrap.classList.remove('shatter', 'on'); last.streakOn = false; });
      return;
    }
    const on = mult > 1;
    if (on !== last.streakOn) { last.streakOn = on; el.streakwrap.classList.toggle('on', on); if (on) el.streakwrap.classList.remove('shatter'); }
    if (mult !== last.streakMult) {
      last.streakMult = mult; el.streak.textContent = '×' + mult;
      if (on) { flip.bump ^= 1; el.streak.className = flip.bump ? 'bump b' : 'bump a'; }
    }
    const q = Math.round(frac * 100) / 100;
    if (q !== last.streakFrac && el.streakbar) { last.streakFrac = q; el.streakbar.style.transform = 'scaleX(' + q + ')'; el.streakbar.classList.toggle('hot', q < 0.3); }
  },

  // ---- abilities -----------------------------------------------------------------------------------------
  setUlt(frac) {
    init();
    const q = Math.round(clamp01(frac) * 100);
    if (q !== last.ult) { last.ult = q; el.ultfill.style.height = q + '%'; }
    const ready = q >= 100;
    if (ready !== last.ultReady) { last.ultReady = ready; el.bUlt.classList.toggle('ready', ready); }
  },
  setDash(charges, max = 2) {
    init();
    charges = Math.max(0, charges | 0); max = Math.max(1, max | 0);
    if (!el.dashPips) return;
    if (max !== last.dashMax) {
      last.dashMax = max; last.dashCharges = -1;
      el.dashPips.innerHTML = '';
      for (let i = 0; i < max; i++) el.dashPips.appendChild(document.createElement('i'));
    }
    if (charges !== last.dashCharges) {
      last.dashCharges = charges;
      const pips = el.dashPips.children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < charges);
      el.bDash.classList.toggle('empty', charges === 0);
    }
  },

  // ---- world / objective ---------------------------------------------------------------------------------
  setWorld(name, objective = '') {
    init();
    if (name !== last.world) { last.world = name; el.worldname.textContent = name || ''; }
    if (objective !== last.objective) { last.objective = objective; el.objective.textContent = objective || ''; }
  },

  // ---- reticle / hit feedback ----------------------------------------------------------------------------
  reticle(state = 'free', sx, sy) {
    init();
    if (state !== last.reticle) { last.reticle = state; el.reticle.className = state === 'off' ? 'hidden' : state; }
    // locked: the reticle sits ON the target so it's obvious what the blaster is pointed at
    const lock = Number.isFinite(sx) && Number.isFinite(sy);
    el.reticle.dataset.label = state === 'range' ? 'OUT OF RANGE' : state === 'edge' ? 'TURN TO TARGET' : '';
    const tx = lock ? Math.round(sx - innerWidth / 2) : 0, ty = lock ? Math.round(sy - (innerHeight / 2 - 20)) : 0;
    if (tx !== last.retX || ty !== last.retY) { last.retX = tx; last.retY = ty; el.reticle.style.transform = tx || ty ? `translate(${tx}px,${ty}px)` : ''; }
  },
  hitmarker(kind = 'body', sx, sy) { init(); el.hitmark.style.left = Number.isFinite(sx) ? sx + 'px' : '50%'; el.hitmark.style.top = Number.isFinite(sy) ? sy + 'px' : 'calc(50% - 20px)'; retrigger(el.hitmark, 'hit', kind); },

  // kind: 'body' | 'weak' | 'crit' | 'kill' | 'heal'
  damageNumber(x, y, text, kind = 'body') {
    init();
    const d = dnPool[dnHead]; dnHead = (dnHead + 1) % DN_POOL;
    const jx = (Math.random() * 16 - 8) | 0, jy = (Math.random() * 16 - 8) | 0;   // ±8 px jitter
    d.textContent = text;
    d.style.left = (x + jx) + 'px'; d.style.top = (y + jy) + 'px'; d.style.opacity = '';
    d.className = 'dn ' + kind + (d.dataset.f === '1' ? ' b' : ' a');
    d.dataset.f = d.dataset.f === '1' ? '0' : '1';
  },

  // angle 0 = attacker straight ahead (arc at top of screen); +angle turns clockwise
  damageDir(angle = 0) {
    init();
    const d = ddPool[ddHead]; ddHead = (ddHead + 1) % DD_POOL;
    d.style.opacity = '';
    d.style.transform = 'rotate(' + angle.toFixed(3) + 'rad)';
    d.className = 'dd ' + (d.dataset.f === '1' ? 'b' : 'a');
    d.dataset.f = d.dataset.f === '1' ? '0' : '1';
  },

  // Persistent edge marker for one off-screen monster. angle: 0 = straight ahead of the camera, +clockwise
  // (same convention as damageDir); null releases the slot. Closer = bigger and brighter; < 4 m pulses.
  // Values are quantised so a marker that barely moved writes nothing.
  threat(e, angle, dist = 10, boss = false) {
    init();
    let t = thMap.get(e);
    if (angle === null || angle === undefined) { if (t) { thMap.delete(e); t.e = null; t.o = 0; t.el.style.opacity = '0'; } return; }
    if (!t) { t = thPool.find(x => !x.e); if (!t) return; t.e = e; t.a = 9; t.s = 0; t.o = 0; t.near = null; t.boss = null; thMap.set(e, t); }
    const a = Math.round(angle * 50) / 50, s = Math.round(clamp01(1.45 - dist / 14) * 20) / 20 * 0.85 + 0.45, o = Math.round(clamp01(1.15 - dist / 26) * 20) / 20;
    if (a !== t.a || s !== t.s) {
      t.a = a; t.s = s;
      // ellipse inside the edge: clear of the top bar, the stick and the buttons at 852x393
      const rx = innerWidth * 0.36, ry = innerHeight * 0.40;
      t.el.style.transform = 'translate(' + (Math.sin(a) * rx).toFixed(1) + 'px,' + (-Math.cos(a) * ry).toFixed(1) + 'px) rotate(' + a.toFixed(3) + 'rad) scale(' + s.toFixed(2) + ')';
    }
    if (o !== t.o) { t.o = o; t.el.style.opacity = String(o); }
    const near = dist < 4; if (near !== t.near || !!boss !== t.boss) { t.near = near; t.boss = !!boss; t.el.className = 'th' + (near ? ' near' : '') + (boss ? ' boss' : ''); }
  },

  // ---- text moments --------------------------------------------------------------------------------------
  banner(text, size = 'normal') { init(); el.banner.textContent = text; retrigger(el.banner, 'banner', size); },
  stamp(text, color = 'gold') { init(); el.stamp.textContent = text; retrigger(el.stamp, 'stamp', color); },
  pickup(text) { init(); el.pickup.textContent = text; retrigger(el.pickup, 'pickup'); },

  killfeed(line) {
    init();
    const d = document.createElement('div');
    const i = line.indexOf(' — ');
    if (i > 0) { const b = document.createElement('b'); b.textContent = line.slice(0, i); d.appendChild(b); d.appendChild(document.createTextNode(line.slice(i))); }
    else d.textContent = line;
    el.killfeed.prepend(d);
    while (el.killfeed.children.length > FEED_MAX) el.killfeed.lastElementChild.remove();
  },

  ghost(text) {
    init();
    const on = !!text;
    if (on && text !== last.ghost) { last.ghost = text; el.ghost.textContent = text; }
    if (on !== last.ghostOn) { last.ghostOn = on; el.ghost.classList.toggle('on', on); }
  },

  // ---- boss ----------------------------------------------------------------------------------------------
  boss(name, sub = null) {
    init();
    const on = !!name;
    if (on) {
      if (name !== last.bossName) { last.bossName = name; el.bossname.textContent = name; }
      if (sub !== last.bossSub) { last.bossSub = sub; el.bosssub.textContent = sub || ''; }
    }
    if (on !== last.bossOn) { last.bossOn = on; el.bossbar.classList.toggle('on', on); if (on) { last.bossFrac = -1; this.bossHP(1, false); } }
  },
  bossHP(frac, flash = false) {
    init();
    const q = Math.round(clamp01(frac) * 200) / 200;
    if (flash) { el.bossbar.classList.add('flash'); timer('bossflash', 100, () => { el.bossbar.classList.remove('flash'); }); }
    if (q !== last.bossFrac) {
      last.bossFrac = q;
      // white flash holds 100 ms, then the bar drains over 250 ms (CSS transition)
      if (flash) timer('bossdrain', 100, () => { el.bossfill.style.transform = 'scaleX(' + q + ')'; });
      else el.bossfill.style.transform = 'scaleX(' + q + ')';
      el.bossbar.classList.toggle('enrage', q > 0 && q <= 0.4);
    }
  },

  // ---- states --------------------------------------------------------------------------------------------
  low(on) { init(); on = !!on; if (on !== last.low) { last.low = on; el.hud.classList.toggle('low', on); } },
  setTouchVisible(on) { init(); on = !!on; if (on !== last.touch) { last.touch = on; el.hud.classList.toggle('notouch', !on); } },
  lefty(on) {
    init(); on = !!on;
    if (on !== last.lefty) { last.lefty = on; el.hud.classList.toggle('lefty', on); el.ctl.classList.toggle('left', on); }
  },

  // full reset between worlds (keeps show/hide + lefty + touch state)
  reset() {
    init();
    for (const k in timers) clearTimeout(timers[k]);
    timers = {};
    last.hp = last.hpMax = last.segs = -1; last.heartbeat = null; last.kills = null;
    last.streakMult = null; last.streakFrac = -1; last.streakOn = null; last.ult = -1; last.ultReady = null;
    last.dashCharges = -1; last.bossName = last.bossSub = null; last.bossOn = null; last.bossFrac = -1; last.low = null; last.ghost = last.ghostOn = null;
    el.streakwrap.classList.remove('on', 'shatter'); el.bossbar.classList.remove('on', 'flash', 'enrage'); el.hud.classList.remove('low');
    el.banner.className = ''; el.stamp.className = ''; el.pickup.className = ''; el.hitmark.className = ''; el.ghost.classList.remove('on');
    el.vignette.style.opacity = '0'; el.killfeed.innerHTML = '';
    for (const d of dnPool) { d.className = 'dn'; d.style.opacity = '0'; }
    for (const d of ddPool) { d.className = 'dd'; d.style.opacity = '0'; }
    for (const t of thPool) { t.e = null; t.o = 0; t.el.style.opacity = '0'; } thMap.clear();
    this.setHP(100, 100); this.setKills(0); this.setStreak(1, 1); this.setUlt(0); this.setDash(2, 2); this.reticle('free');
  },
};
