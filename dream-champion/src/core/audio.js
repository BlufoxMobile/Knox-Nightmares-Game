// WebAudio engine: buses, unlock, world filters, 3D-lite panning, layered music stems, procedural fallback SFX.
import { clamp, rnd } from './math.js';
import { save } from './save.js';

export class Audio {
  constructor() {
    this.ctx = null; this.buffers = new Map(); this.muted = !!save.data.settings.mute; this.unlocked = false;
    this.listener = { x: 0, z: 0, yaw: 0 }; this.music = { layers: {}, current: null }; this.pending = [];
    this._noiseBuf = null; this.lastPlay = new Map(); this.aliases = {};
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) { }
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(ctx.destination);
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 4; this.comp.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1; this.musBus = ctx.createGain(); this.musBus.gain.value = 0.75;
    this.worldLPF = ctx.createBiquadFilter(); this.worldLPF.type = 'lowpass'; this.worldLPF.frequency.value = 22000; this.worldLPF.Q.value = 0.2;
    this.sfxBus.connect(this.worldLPF); this.worldLPF.connect(this.comp); this.musBus.connect(this.comp);
    // cheap reverb send
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(2.2, 2.4); this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.18; this.sfxBus.connect(this.verbGain); this.verbGain.connect(this.verb); this.verb.connect(this.worldLPF);
    this.uiBus = ctx.createGain(); this.uiBus.connect(this.comp);
    const unlock = () => { ctx.resume().then(() => { this.unlocked = true; }); if (ctx.state === 'running') this.unlocked = true; };
    ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend(); else ctx.resume(); });
    return ctx;
  }
  async decode(ab) { const ctx = this.ensure(); return await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); }
  register(name, buffer) { this.buffers.set(name, buffer); }
  alias(map) { Object.assign(this.aliases, map); }
  _resolve(name) { let n = name, i = 0; while (this.aliases[n] && !this.buffers.has(n) && i++ < 4) n = this.aliases[n]; return n; }
  setMuted(m) { this.muted = m; save.data.settings.mute = m; save.write(); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05); }
  setWorldFilter(underwater) { if (!this.worldLPF) return; this.worldLPF.frequency.setTargetAtTime(underwater ? 1400 : 22000, this.ctx.currentTime, 0.4); this.verbGain.gain.setTargetAtTime(underwater ? 0.4 : 0.18, this.ctx.currentTime, 0.4); }
  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }
  _impulse(sec, decay) { const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
  _noise() { if (this._noiseBuf) return this._noiseBuf; const ctx = this.ctx, n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return this._noiseBuf = b; }
  // --- SFX ---
  // play(name, {x,z, vol, rate, ui, loop}) ; if x,z given -> pans & attenuates relative to listener
  play(name, o = {}) {
    if (!this.ctx || !this.unlocked) return null; const ctx = this.ctx; const now = ctx.currentTime; name = this._resolve(name);
    const lp = this.lastPlay.get(name) || 0; const minGap = o.minGap ?? 0.03; if (now - lp < minGap) return null; this.lastPlay.set(name, now);
    let vol = o.vol ?? 1, pan = 0;
    if (o.x !== undefined) { const dx = o.x - this.listener.x, dz = o.z - this.listener.z; const d = Math.hypot(dx, dz); const ref = o.ref ?? 6, max = o.max ?? 34; vol *= clamp(1 - Math.max(0, d - ref) / (max - ref), 0, 1); if (vol <= 0.01) return null; const ang = Math.atan2(dx, dz) - this.listener.yaw; pan = clamp(Math.sin(ang) * 0.85, -1, 1); }
    const g = ctx.createGain(); g.gain.value = vol; const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) { p.pan.value = pan; g.connect(p); p.connect(o.ui ? this.uiBus : this.sfxBus); } else g.connect(o.ui ? this.uiBus : this.sfxBus);
    const buf = this.buffers.get(name) || this._pickVariant(name);
    if (buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = (o.rate ?? 1) * (o.vary ? rnd(1 - o.vary, 1 + o.vary) : 1); s.loop = !!o.loop; s.connect(g); s.start(now + (o.delay || 0)); return { src: s, gain: g, stop: (t = 0.05) => { g.gain.setTargetAtTime(0, ctx.currentTime, t); s.stop(ctx.currentTime + t * 5); } }; }
    this._synth(name, g, now + (o.delay || 0), o); return { gain: g, stop: () => { } };
  }
  _pickVariant(name) { const vs = []; for (let i = 1; i <= 4; i++) { const b = this.buffers.get(name + i); if (b) vs.push(b); } return vs.length ? vs[(Math.random() * vs.length) | 0] : null; }
  // procedural fallbacks so the game always has sound
  _synth(name, out, t, o) {
    const ctx = this.ctx; const tone = (type, f0, f1, dur, vol = 0.5, curve = 'exp') => { const os = ctx.createOscillator(), g = ctx.createGain(); os.type = type; os.frequency.setValueAtTime(f0, t); if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); os.connect(g); g.connect(out); os.start(t); os.stop(t + dur + 0.02); };
    const noise = (dur, vol = 0.5, f = 1200, q = 0.7, type = 'bandpass') => { const s = ctx.createBufferSource(); s.buffer = this._noise(); const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = q; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(bq); bq.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.02); };
    if (/starfire|blaster|shot/.test(name)) { tone('square', 880, 160, 0.13, 0.35); tone('sine', 120, 40, 0.12, 0.6); noise(0.06, 0.3, 4000, 1, 'highpass'); }
    else if (/bonesaw|disc/.test(name)) { tone('sawtooth', 300, 900, 0.16, 0.3); tone('sine', 90, 50, 0.1, 0.5); }
    else if (/depth|torpedo/.test(name)) { tone('sine', 220, 60, 0.35, 0.5); noise(0.3, 0.25, 500, 0.5); }
    else if (/explode|boom|slam|shock/.test(name)) { tone('sine', 90, 25, 0.6, 0.9); noise(0.5, 0.6, 300, 0.4, 'lowpass'); }
    else if (/headshot|crit|skull/.test(name)) { noise(0.12, 0.6, 2500, 0.8); tone('square', 600, 100, 0.12, 0.3); tone('sine', 1800, 1400, 0.2, 0.15); }
    else if (/hit|flesh|impact/.test(name)) { noise(0.08, 0.5, 900, 0.9); tone('triangle', 200, 80, 0.08, 0.3); }
    else if (/sever|tear|gore/.test(name)) { noise(0.25, 0.5, 600, 0.5); tone('sawtooth', 160, 60, 0.2, 0.25); }
    else if (/kill|gurgle|death/.test(name)) { tone('sawtooth', 160, 40, 0.5, 0.3); noise(0.4, 0.3, 700, 0.6); }
    else if (/roar/.test(name)) { tone('sawtooth', 70, 45, 1.4, 0.9); tone('square', 110, 60, 1.2, 0.4); noise(1.2, 0.5, 400, 0.4, 'lowpass'); }
    else if (/whisper/.test(name)) { noise(0.9, 0.25, 2800, 3); noise(0.6, 0.15, 1800, 3); }
    else if (/scream|screech/.test(name)) { tone('sawtooth', 900, 1600, 0.5, 0.35); tone('square', 1400, 700, 0.5, 0.2); noise(0.5, 0.3, 3000, 1); }
    else if (/groan|moan/.test(name)) { tone('sawtooth', 110, 80, 1.2, 0.3); tone('triangle', 165, 120, 1.2, 0.2); }
    else if (/hurt|knox/.test(name)) { tone('square', 300, 180, 0.15, 0.3); noise(0.1, 0.2, 1500, 1); }
    else if (/dash|whoosh|roll/.test(name)) { noise(0.25, 0.4, 900, 0.3, 'bandpass'); }
    else if (/dodge|chime|perfect/.test(name)) { tone('sine', 1200, 1200, 0.25, 0.3); tone('sine', 1800, 1800, 0.35, 0.25); tone('sine', 2400, 2400, 0.4, 0.15); }
    else if (/pickup|heart|power/.test(name)) { tone('triangle', 660, 1320, 0.2, 0.3); tone('triangle', 990, 1980, 0.25, 0.2); }
    else if (/ult|breaker|charge/.test(name)) { tone('sawtooth', 60, 900, 0.9, 0.5); noise(0.9, 0.3, 800, 0.4); }
    else if (/heartbeat/.test(name)) { tone('sine', 55, 40, 0.25, 0.9); tone('sine', 50, 38, 0.2, 0.7); }
    else if (/thump|sub/.test(name)) { tone('sine', 45, 30, 0.5, 1.0); }
    else if (/ui|click|tap/.test(name)) { tone('square', 800, 500, 0.05, 0.15); }
    else if (/stamp|banner/.test(name)) { noise(0.15, 0.4, 1500, 0.5); tone('sine', 80, 40, 0.3, 0.6); }
    else if (/coin|mario/.test(name)) { tone('square', 988, 988, 0.08, 0.2); setTimeout(() => { }, 0); tone('square', 1319, 1319, 0.35, 0.2); }
    else if (/gasp|wake/.test(name)) { noise(0.4, 0.5, 1200, 0.7, 'highpass'); }
    else if (/bubble|water|splash/.test(name)) { tone('sine', 400, 900, 0.15, 0.2); noise(0.2, 0.2, 2000, 0.5); }
    else if (/dirt|grave|burst/.test(name)) { noise(0.5, 0.6, 250, 0.4, 'lowpass'); tone('sine', 70, 35, 0.4, 0.6); }
    else if (/bite|chomp/.test(name)) { noise(0.15, 0.7, 500, 0.6); tone('sine', 60, 30, 0.4, 0.9); }
    else if (/spit|acid|hiss/.test(name)) { noise(0.35, 0.35, 3000, 0.5, 'highpass'); }
    else if (/zap|electric/.test(name)) { tone('sawtooth', 2000, 300, 0.2, 0.25); noise(0.15, 0.3, 4000, 2); }
    else if (/sonar|ping/.test(name)) { tone('sine', 1500, 1400, 0.8, 0.3); }
    else if (/creak|door/.test(name)) { tone('sawtooth', 180, 260, 0.9, 0.12); }
    else { tone('sine', 440, 330, 0.1, 0.2); }
  }
  // --- MUSIC: named stems that loop, crossfade by weights ---
  // stems: { bed:'forest_bed', tension:'forest_tension', combat:'forest_combat', boss:'forest_boss' }
  setMusic(stems, fade = 1.5) {
    if (!this.ctx) return; const ctx = this.ctx, now = ctx.currentTime;
    const key = JSON.stringify(stems); if (this.music.key === key) return; this.music.key = key;
    for (const k in this.music.layers) { const L = this.music.layers[k]; L.gain.gain.setTargetAtTime(0, now, fade / 3); L.src.stop(now + fade * 2); }
    this.music.layers = {}; this.music.weights = {};
    if (!stems) return;
    for (const role in stems) { const buf = this.buffers.get(stems[role]) || this.buffers.get('music_' + stems[role]); if (!buf) continue; const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; if (buf.duration > 4) { src.loopStart = 0.03; src.loopEnd = buf.duration - 0.06; } const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.musBus); src.start(now + 0.05); this.music.layers[role] = { src, gain: g }; }
    this.setMusicMix({ bed: 1 }, 0.1);
  }
  setMusicMix(weights, fade = 1.2) {
    if (!this.ctx) return; const now = this.ctx.currentTime;
    for (const role in this.music.layers) { const w = weights[role] ?? 0; this.music.layers[role].gain.gain.setTargetAtTime(w, now, fade / 3); }
  }
  musicDuck(amount = 0.2, sec = 1) { if (!this.ctx) return; const now = this.ctx.currentTime; this.musBus.gain.cancelScheduledValues(now); this.musBus.gain.setTargetAtTime(amount, now, 0.05); this.musBus.gain.setTargetAtTime(0.75, now + sec, 0.4); }
  stopMusic(fade = 1) { this.setMusic(null, fade); }
}
