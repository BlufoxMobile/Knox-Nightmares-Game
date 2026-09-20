export class Pool {
  constructor(factory, n = 0) { this.factory = factory; this.free = []; this.live = []; for (let i = 0; i < n; i++) this.free.push(factory()); }
  get() { const o = this.free.pop() || this.factory(); this.live.push(o); return o; }
  release(o) { const i = this.live.indexOf(o); if (i >= 0) { this.live[i] = this.live[this.live.length - 1]; this.live.pop(); } this.free.push(o); }
  releaseAll() { for (const o of this.live) this.free.push(o); this.live.length = 0; }
}
