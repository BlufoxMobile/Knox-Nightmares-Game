const KEY = 'knox-nightmares-v2';
const DEF = { version: 2, slain: {}, best: {}, secrets: {}, settings: { autoBlast: true, look: 1, lefty: false, shake: 1, quality: 'auto', mute: false, difficulty: 'brave', seenIntro: false, seenTut: {} }, stats: { kills: 0, headshots: 0, dodges: 0, wakes: 0 } };
function deep(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = a[k] || {}; deep(a[k], b[k]); } else if (a[k] === undefined) a[k] = b[k]; } return a; }
export const save = {
  data: null,
  load() { try { const raw = localStorage.getItem(KEY); this.data = raw ? deep(JSON.parse(raw), JSON.parse(JSON.stringify(DEF))) : JSON.parse(JSON.stringify(DEF)); } catch (e) { this.data = JSON.parse(JSON.stringify(DEF)); } return this.data; },
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { } },
  reset() { this.data = JSON.parse(JSON.stringify(DEF)); this.write(); }
};
save.load();
