export class Emitter {
  constructor() { this.m = new Map(); }
  on(e, fn) { if (!this.m.has(e)) this.m.set(e, new Set()); this.m.get(e).add(fn); return () => this.off(e, fn); }
  off(e, fn) { this.m.get(e)?.delete(fn); }
  emit(e, a, b, c) { const s = this.m.get(e); if (s) for (const fn of s) fn(a, b, c); }
}
export const bus = new Emitter();
