// Fixed-timestep loop with interpolation alpha and a global time scale (for hit-stop / slow-mo).
export class Loop {
  constructor(game) {
    this.game = game; this.STEP = 1 / 60; this.MAX = 4; this.acc = 0; this.last = 0; this.raf = 0; this.running = false;
    this.timeScale = 1; this.hitStop = 0; this.slow = { t: 0, s: 1 }; this.fps = 60; this._fpsAcc = 0; this._fpsN = 0; this.frameMs = 16;
    this._frame = this._frame.bind(this);
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.acc = 0; this.raf = requestAnimationFrame(this._frame); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  // hitStop: freeze the sim for ms; slowMo: scale for seconds
  stopTime(ms) { this.hitStop = Math.max(this.hitStop, ms / 1000); }
  slowMo(scale, seconds) { this.slow.s = scale; this.slow.t = seconds; }
  _frame(now) {
    if (!this.running) return; this.raf = requestAnimationFrame(this._frame);
    const t0 = performance.now();
    let real = (now - this.last) / 1000; this.last = now; if (real > 0.25) real = this.STEP; if (real < 0) real = 0;
    this._fpsAcc += real; this._fpsN++; if (this._fpsAcc >= 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    let scale = this.timeScale;
    if (this.hitStop > 0) { this.hitStop -= real; scale = 0; }
    else if (this.slow.t > 0) { this.slow.t -= real; scale *= this.slow.s; }
    const dt = real * scale;
    this.acc += dt; let steps = 0;
    while (this.acc >= this.STEP && steps < this.MAX) { this.game.fixedUpdate(this.STEP); this.acc -= this.STEP; steps++; }
    if (steps === this.MAX) this.acc = 0;
    const alpha = this.acc / this.STEP;
    this.game.update(dt, real, alpha);
    this.game.render(alpha, real);
    this.frameMs = performance.now() - t0;
  }
}
