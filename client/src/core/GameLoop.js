import { CONFIG } from './Config.js';

export class GameLoop {
  constructor({ update, render, fixedDt = CONFIG.physics.fixedDt, maxDt = CONFIG.physics.maxDt, maxSubsteps = CONFIG.physics.maxSubsteps }) {
    this.update = update;
    this.render = render;
    this.fixedDt = fixedDt;
    this.maxDt = maxDt;
    this.maxSubsteps = maxSubsteps;
    this.running = false;
    this.lastTime = 0;
    this.acc = 0;
    this.rafId = null;
    this.elapsed = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.acc = 0;
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  _tick(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._tick);

    if (!this.lastTime) this.lastTime = now;
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, this.maxDt);

    this.elapsed += dt;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.fixedDt && steps < this.maxSubsteps) {
      this.update(this.fixedDt, this.elapsed);
      this.acc -= this.fixedDt;
      steps++;
    }
    if (steps >= this.maxSubsteps) this.acc = 0;

    this.render(dt, this.elapsed);
  }
}