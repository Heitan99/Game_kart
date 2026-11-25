import { STATE } from './Config.js';

export class GameState {
  constructor(initial = STATE.MENU) {
    this.current = initial;
    this.previous = null;
    this.pausedFrom = null;
    this.listeners = new Set();
  }

  set(next) {
    if (next === this.current) return;
    this.previous = this.current;
    this.current = next;
    for (const fn of this.listeners) fn(next, this.previous);
  }

  is() {
    for (let i = 0; i < arguments.length; i++) {
      if (this.current === arguments[i]) return true;
    }
    return false;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  transitionToPause() {
    if (this.current !== STATE.RACING && this.current !== STATE.COUNTDOWN) return false;
    this.pausedFrom = this.current;
    this.set(STATE.PAUSED);
    return true;
  }

  resume() {
    if (this.current !== STATE.PAUSED) return false;
    const back = this.pausedFrom || STATE.RACING;
    this.pausedFrom = null;
    this.set(back);
    return true;
  }
}