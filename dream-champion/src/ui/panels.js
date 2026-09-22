// Menu / overlay screens rendered into #ov. One delegated pointer handler; every tappable element carries
// data-a="<action>" and the panel's callback receives that string. All text comes from COPY.
import { COPY } from '../game/data/copy.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const br = s => esc(s).replace(/\n/g, '<br>');
const WORLD_KEYS = ['forest', 'grave', 'sea'];
const WORLD_BOSS = { forest: 'hollowstag', grave: 'rotking', sea: 'megalodon' };
const WORLD_SECRET = { forest: 'tree', grave: 'grave', sea: 'console' };
const SECRET_KEYS = ['tree', 'grave', 'console'];
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 3.5c0-.5 0-.9-.1-1.4l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.4-1.4L15 2.7H9l-.5 2.5a8 8 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6a8.3 8.3 0 0 0 0 2.8l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.4 1.4l.5 2.5h6l.5-2.5a8 8 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.6c.1-.5.1-.9.1-1.4z"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let ov = null, cb = null, current = null, downEl = null, downX = 0, downY = 0;
let timers = [];
const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { for (const t of timers) clearTimeout(t); timers.length = 0; };
const fmtTime = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function init() {
  if (ov) return ov;
  ov = $('ov');
  ov.addEventListener('pointerdown', e => { downEl = e.target.closest('[data-a]'); downX = e.clientX; downY = e.clientY; if (downEl) downEl.classList.add('press'); }, { passive: true });
  ov.addEventListener('pointerup', e => {
    const up = e.target.closest('[data-a]');
    const d = downEl; downEl = null;
    if (d) d.classList.remove('press');
    if (!up || up !== d || Math.abs(e.clientX - downX) > 24 || Math.abs(e.clientY - downY) > 24) return;
    act(up);
  });
  ov.addEventListener('pointercancel', () => { if (downEl) downEl.classList.remove('press'); downEl = null; }, { passive: true });
  ov.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const b = e.target.closest('[data-a]'); if (b) { e.preventDefault(); act(b); } } });
  return ov;
}

function act(node) {
  const a = node.dataset.a;
  if (!a || node.classList.contains('disabled')) return;
  // settings toggles: highlight locally for instant feedback, then tell the game
  if (a.startsWith('set:')) {
    const g = node.closest('.toggle'); if (g) for (const b of g.children) b.classList.toggle('on', b === node);
    if (a.startsWith('set:difficulty:')) { const c = node.closest('.dpick'); if (c) for (const x of c.querySelectorAll('.dcard')) x.classList.toggle('sel', x === node); }
    cb && cb(a, a.slice(4)); return;
  }
  if (a.startsWith('difficulty:')) {
    const c = node.closest('.dpick'); if (c) { for (const x of c.querySelectorAll('.dcard')) x.classList.toggle('sel', x === node); c.dataset.picked = '1'; }
    cb && cb(a); return;
  }
  if (a === 'start') {
    // first launch: if the difficulty pick is on screen and untouched, commit the highlighted default
    const c = ov.querySelector('.dpick'); if (c && !c.dataset.picked) { const s = c.querySelector('.dcard.sel'); if (s) cb && cb(s.dataset.a); }
  }
  cb && cb(a);
}

function render(name, cls, html, fn) {
  init(); clearTimers();
  current = name; cb = fn || null;
  ov.className = cls;
  ov.innerHTML = html;
  return ov;
}

// ---- shared fragments --------------------------------------------------------------------------------------------
function toggle(key, val, opts) {
  return '<span class="toggle" data-k="' + key + '">' + opts.map(([label, v]) => '<button type="button" data-a="set:' + key + ':' + v + '"' + (String(v) === String(val) ? ' class="on"' : '') + '>' + esc(label) + '</button>').join('') + '</span>';
}
const bool = v => (v === true || v === 1 || v === '1' || v === 'true') ? 'true' : 'false';
function settingsHTML(s = {}, withDifficulty = false) {
  const S = COPY.settings;
  const rows = [
    ['CAMERA CONTROL', toggle('controlMode', s.controlMode ?? 'follow', [['FOLLOW KNOX', 'follow'], ['INDEPENDENT AIM', 'twin']])],
    ['BUTTON SIZE', toggle('controlSize', s.controlSize ?? 1, [['SMALL', .85], ['NORMAL', 1], ['LARGE', 1.15]])],
    ['BUTTON OPACITY', toggle('controlOpacity', s.controlOpacity ?? .9, [['SOFT', .6], ['CLEAR', .9], ['SOLID', 1]])],
    ['SIDE SPACING', toggle('controlInset', s.controlInset ?? 14, [['EDGE', 14], ['INSET', 38], ['WIDE', 62]])],
    ['BUTTON HEIGHT', toggle('controlHeight', s.controlHeight ?? 14, [['LOW', 14], ['MID', 38], ['HIGH', 62]])],
    ['THREAT WARNINGS', toggle('threatWarnings', bool(s.threatWarnings ?? true), [['ON', 'true'], ['OFF', 'false']])],
    ['REPEAT WAKE FILM', toggle('wakeReplay', s.wakeReplay ?? 'watch', [['WATCH', 'watch'], ['SKIP AFTER FIRST', 'skip']])],
    [S.autoBlast, toggle('autoBlast', bool(s.autoBlast ?? true), [['ON', 'true'], ['OFF', 'false']])],
    [S.look, toggle('look', s.look ?? 1, [['SLOW', 0.7], ['NORMAL', 1], ['FAST', 1.4]])],
    [S.lefty, toggle('lefty', bool(s.lefty ?? false), [['OFF', 'false'], ['ON', 'true']])],
    [S.shake, toggle('shake', s.shake ?? 1, [['FULL', 1], ['LESS', 0.5], ['OFF', 0]])],
    [S.quality, toggle('quality', s.quality ?? 'auto', [['AUTO', 'auto'], ['HIGH', 'high'], ['MED', 'medium'], ['LOW', 'low']])],
  ];
  if (withDifficulty) rows.push([S.diff, toggle('difficulty', s.difficulty ?? 'brave', [[COPY.difficulty.brave, 'brave'], [COPY.difficulty.brutal, 'brutal']])]);
  return '<div class="srows">' + rows.map(([l, t]) => '<div class="srow"><label>' + esc(l) + '</label>' + t + '</div>').join('') + '</div>';
}
function difficultyHTML(sel = 'brave') {
  const D = COPY.difficulty;
  const card = (k, name, desc) => '<button type="button" class="dcard ' + k + (sel === k ? ' sel' : '') + '" data-a="difficulty:' + k + '"><b>' + esc(name) + '</b><em>' + esc(desc) + '</em></button>';
  return '<div class="dpick"><small>' + esc(COPY.settings.diff) + '</small><div class="dcards">' + card('brave', D.brave, D.braveDesc) + card('brutal', D.brutal, D.brutalDesc) + '</div></div>';
}
const btn = (a, label, cls = '') => '<button type="button" class="btn ' + cls + '" data-a="' + a + '">' + esc(label) + '</button>';

// ---- screens -----------------------------------------------------------------------------------------------------
export const panels = {
  init,
  get current() { return current; },
  get el() { return init(); },

  // opts: { settings, pickDifficulty } — the difficulty cards show when pickDifficulty is true or settings.difficulty is unset.
  // Actions: 'start' | 'settings' | 'difficulty:brave' | 'difficulty:brutal'
  title(fn, opts = {}) {
    const s = opts.settings || null;
    const pick = opts.pickDifficulty === true || (opts.pickDifficulty !== false && (!s || !s.difficulty));
    const html =
      '<div id="title"><div class="tbox">' +
        '<div class="eyebrow">A KNOX ORIGINAL NIGHTMARE</div>' +
        '<h1 class="glitch" data-t="' + esc(COPY.title) + '">' + esc(COPY.title) + '</h1>' +
        '<h2>' + esc(COPY.title2) + '</h2>' +
        '<div class="tag">' + esc(COPY.tagline) + '</div>' +
        (pick ? difficultyHTML(s?.difficulty || 'brave') : '') +
        '<div class="trow">' + btn('start', COPY.start, 'pulse') + '<button type="button" class="gear" data-a="settings" aria-label="' + esc(COPY.pause.settings) + '">' + GEAR + '</button></div>' +
        '<div class="foot">LANDSCAPE · HEADPHONES</div>' +
      '</div></div>';
    render('title', '', html, fn);
  },

  // state: { slain:{forest,grave,sea}, secrets:{tree,grave,console}, best? }   Actions: 'world:<key>' | 'settings'
  map(state = {}, fn) {
    const slain = state.slain || {}, secrets = state.secrets || {};
    const n = WORLD_KEYS.filter(k => slain[k]).length;
    const cards = WORLD_KEYS.map((k, i) => {
      const w = COPY.worlds[k], b = COPY.bosses[WORLD_BOSS[k]], done = !!slain[k];
      return '<button type="button" class="wcard ' + k + (done ? ' done' : '') + '" data-a="world:' + k + '" data-slain="' + esc(COPY.map.slain) + '">' +
        '<span class="num">0' + (i + 1) + '</span><small>' + esc(w.sub) + '</small><b>' + esc(w.name) + '</b><em>' + esc(w.tag) + '</em>' +
        '<span class="vs">' + esc(b.name) + '</span><span class="go">' + esc(done ? COPY.cleared.again : COPY.map.play) + '</span></button>';
    }).join('');
    const chips = SECRET_KEYS.map(k => {
      const f = !!secrets[k];
      return '<span class="chip' + (f ? ' found' : '') + '">' + (f ? (k === 'console' ? '?? — ' + esc(COPY.secrets.console) : '?? — FOUND') : '??') + '</span>';
    }).join('');
    const html =
      '<div class="panel wide mapp">' +
        '<div class="eyebrow">' + esc(COPY.title) + ' ' + esc(COPY.title2) + '</div>' +
        '<h1 class="mh">' + esc(COPY.map.head) + '</h1>' +
        '<div class="map">' + cards + '</div>' +
        '<div class="mfoot"><div class="prog"><b>' + esc(COPY.map.progress(n)) + '</b></div><div class="chips">' + chips + '</div>' +
        '<button type="button" class="link" data-a="settings">' + GEAR + esc(COPY.pause.settings) + '</button></div>' +
      '</div>';
    render('map', 'dim', html, fn);
  },

  // Actions: 'resume' | 'quit' | 'set:<key>:<value>'
  pause(fn, settings = {}) {
    const html =
      '<div class="panel wide pausep">' +
        '<h1 class="ph">' + esc(COPY.pause.head) + '</h1>' +
        '<div class="sscroll">' + settingsHTML(settings, false) + '</div>' +
        '<div class="row">' + btn('resume', COPY.pause.resume, 'pulse') + btn('quit', COPY.pause.quit, 'alt') + '</div>' +
      '</div>';
    render('pause', 'dim', html, fn);
  },

  // The wake-up film finishes before this card appears. Actions: retry | map.
  wake(fn) {
    const W = COPY.wake;
    const html = '<div class="wakep wake-retry">' +
      '<h1>' + esc(W.head) + '</h1>' +
      '<p class="body">' + esc(W.body) + '</p>' +
      '<div class="row">' + btn('retry', W.back, 'pulse') + btn('map', W.other, 'alt small') + '</div>' +
      '</div>';
    render('wake', 'dim wake wake-result', html, fn);
  },

  // a load failed (bad signal in the car). Actions: 'retry' | 'map'
  error(fn) {
    const E = COPY.error;
    const html = '<div class="wakep">' + '<h1>' + esc(E.head) + '</h1>' + '<p class="body">' + br(E.body) + '</p>' +
      '<div class="row">' + btn('retry', E.retry, 'pulse') + btn('map', E.back, 'alt small') + '</div>' + '</div>';
    render('error', 'dim wake', html, fn);
  },

  // stats: { world, kills, headshots, streak, time (s), secret }   Actions: 'map' | 'again'
  cleared(stats = {}, fn) {
    const C = COPY.cleared, k = stats.world || 'forest';
    const w = COPY.worlds[k] || COPY.worlds.forest, b = COPY.bosses[WORLD_BOSS[k]] || COPY.bosses.hollowstag;
    const secretName = COPY.secrets[WORLD_SECRET[k]];
    const html =
      '<div class="panel wide clearp">' +
        '<div class="eyebrow">' + esc(w.name) + '</div>' +
        '<h1 class="slain">' + esc(C.head) + '</h1>' +
        '<h2>' + esc(b.name) + '</h2>' +
        '<p>' + esc(C[k] || '') + '</p>' +
        '<div class="statline">' +
          '<div><small>KILLS</small><strong>' + esc(stats.kills | 0) + '</strong></div>' +
          '<div><small>HEADSHOTS</small><strong>' + esc(stats.headshots | 0) + '</strong></div>' +
          '<div><small>BEST STREAK</small><strong>×' + esc(Math.max(1, stats.streak | 0)) + '</strong></div>' +
          '<div><small>TIME</small><strong>' + fmtTime(stats.time) + '</strong></div>' +
        '</div>' +
        (stats.secret ? '<div class="chips center"><span class="chip found">?? — ' + esc(k === 'sea' ? secretName : 'FOUND') + '</span></div>' : '') +
        '<div class="row">' + btn('map', C.next, 'pulse') + btn('again', C.again, 'alt') + '</div>' +
      '</div>';
    render('cleared', 'dim', html, fn);
  },

  // Actions: 'reset' | 'ending'
  victory(fn) {
    const F = COPY.final;
    const html =
      '<div class="victp">' +
        '<div class="eyebrow">' + esc(F.stamp) + '</div>' +
        '<h1 class="glitch" data-t="' + esc(F.name) + '">' + esc(F.name) + '</h1>' +
        '<h2>' + esc(F.title) + '</h2>' +
        '<p class="soft">' + esc(F.soft) + '</p>' +
        '<div class="row">' + btn('reset', F.again, 'pulse') + btn('ending', F.watch, 'alt') + '</div>' +
      '</div>';
    render('victory', 'black', html, fn);
  },

  // Actions: 'back' | 'set:<key>:<value>'
  settings(fn, settings = {}) {
    const html =
      '<div class="panel setp">' +
        '<div class="shead"><button type="button" class="ib back" data-a="back" aria-label="Back">' + BACK + '</button><h1>' + esc(COPY.pause.settings) + '</h1></div>' +
        '<div class="sscroll">' + settingsHTML(settings, true) + '</div>' +
        '<div class="row">' + btn('back', 'DONE', 'pulse') + '</div>' +
      '</div>';
    render('settings', 'dim', html, fn);
  },

  // Boss intro title card. Letters of the name type in (~70 ms each); onLetter(i, char, total) fires per letter so the
  // game can thump. Auto-removes after 3.2 s. Resolves when removed (or when hide() cuts it short).
  bossCard(name, title, quote, onLetter) {
    const letters = Array.from(name || '');
    const html =
      '<div class="bcard">' +
        '<div class="btitle">' + esc(title || '') + '</div>' +
        '<div class="bname" aria-label="' + esc(name) + '">' + letters.map((c, i) => '<span data-i="' + i + '"' + (c === ' ' ? ' class="sp"' : '') + '>' + esc(c) + '</span>').join('') + '</div>' +
        '<div class="bquote">' + esc(quote || '') + '</div>' +
      '</div>';
    render('boss', 'card', html, null);
    const spans = ov.querySelectorAll('.bname span');
    const nameEl = ov.querySelector('.bname'), quoteEl = ov.querySelector('.bquote');
    // fit the name inside the safe width (letters are ~0.62em wide + 0.14em tracking in the title face)
    const card = ov.querySelector('.bcard'), cs = getComputedStyle(card);
    const avail = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const base = Math.min(Math.max(44, innerHeight * 0.2), 104);
    nameEl.style.fontSize = Math.floor(Math.min(base, avail / (Math.max(letters.length, 6) * 0.76))) + 'px';
    let i = 0, t = 0;
    const step = () => {
      while (i < spans.length && spans[i].classList.contains('sp')) { spans[i].classList.add('in'); i++; }
      if (i < spans.length) {
        spans[i].classList.add('in');
        onLetter && onLetter(i, letters[i], spans.length);
        i++; t += 70;
        if (i < spans.length) later(70, step); else later(120, () => { nameEl.classList.add('glitch'); nameEl.dataset.t = name; quoteEl.classList.add('in'); });
      }
    };
    later(220, step);
    return new Promise(res => {
      const done = () => { if (current === 'boss') { ov.classList.add('out'); later(260, () => { if (current === 'boss') panels.hide(); res(); }); } else res(); };
      later(3200, done);
      panels._cut = res;
    });
  },

  // Black screen, lines fade in one after another (1.4 s each). Tap skips. Resolves 'done' | 'skip'.
  coldOpen(lines = COPY.coldOpen, fn) {
    const html = '<div class="cold" data-a="skip">' + lines.map(l => '<div class="cline">' + esc(l) + '</div>').join('') + '</div>';
    let resolve;
    const p = new Promise(res => { resolve = res; });
    render('cold', 'black', html, a => { if (a === 'skip') finish('skip'); });
    const els = ov.querySelectorAll('.cline');
    let finished = false;
    const finish = how => { if (finished) return; finished = true; clearTimers(); fn && fn(how); resolve(how); };
    els.forEach((e, i) => later(400 + i * 1400, () => e.classList.add('in')));
    later(400 + els.length * 1400 + 600, () => finish('done'));
    panels._cut = () => finish('skip');
    return p;
  },

  hide() {
    init(); clearTimers();
    const cut = panels._cut; panels._cut = null;
    current = null; cb = null; downEl = null;
    ov.className = 'hidden'; ov.innerHTML = '';
    if (cut) cut('skip');
  },
};
