// Full-screen DOM fx layers: #flash (screen-blend hit flash), #tear (wake-up glitch), #fade (black), #letterbox.
const $ = id => document.getElementById(id);
let el = null, tearFlip = 0, flashT = 0, fadeT = 0;
function init() {
  if (el) return el;
  el = { flash: $('flash'), tear: $('tear'), fade: $('fade'), letterbox: $('letterbox') };
  return el;
}

export const fxdom = {
  init,
  // Snap to `alpha` then fade out over `ms`. color: any CSS colour (default white). Cheap: two style writes.
  flash(alpha = 0.6, ms = 160, color = '#fff') {
    init();
    const f = el.flash;
    clearTimeout(flashT);
    f.style.transition = 'none';
    if (f.dataset.c !== color) { f.dataset.c = color; f.style.background = color; }
    f.style.opacity = String(Math.max(0, Math.min(1, alpha)));
    // next frame: ease back to 0
    flashT = setTimeout(() => { f.style.transition = 'opacity ' + ms + 'ms ease-out'; f.style.opacity = '0'; }, 16);
  },
  // the "YOU WOKE UP" screen tear (scanline glitch, ~350 ms). Retriggers reliably.
  tear() {
    init();
    tearFlip ^= 1;
    el.tear.className = tearFlip ? 'on b' : 'on a';
  },
  // fade(1) = to black, fade(0) = reveal. Resolves when the transition has finished.
  fade(to = 1, ms = 600) {
    init();
    const f = el.fade;
    clearTimeout(fadeT);
    f.classList.remove('slow');
    f.style.transition = 'opacity ' + ms + 'ms ease';
    f.style.opacity = String(to ? 1 : 0);
    f.style.pointerEvents = to ? 'auto' : 'none';
    return new Promise(res => { fadeT = setTimeout(res, ms + 20); });
  },
  // hard cut (no transition)
  cut(to = 1) { init(); el.fade.style.transition = 'none'; el.fade.style.opacity = String(to ? 1 : 0); el.fade.style.pointerEvents = to ? 'auto' : 'none'; },
  letterbox(on = true) { init(); el.letterbox.classList.toggle('on', !!on); },
};
