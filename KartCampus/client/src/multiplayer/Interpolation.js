/* =====================================================================
   KART CAMPUS — interpolación de karts remotos
   Guarda un buffer de snapshots y muestrea entre los dos más cercanos
   al tiempo de render retrasado. Suaviza la red sin inventar física.
   ===================================================================== */
import { clamp, wrapAngle } from '/shared/GameConfig.js';

export class Interpolation {
  constructor(delay = 0.12) {
    this.delay = delay;
    this.buffers = new Map();
    this.renderTime = null;
    this.latestTime = 0;
    this.maxSamples = 30;
  }

  reset() {
    this.buffers.clear();
    this.renderTime = null;
    this.latestTime = 0;
  }

  /** Incorpora un snapshot ya decodificado {time, karts:[...]}. */
  ingest(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.karts)) return;
    if (this.renderTime === null) this.renderTime = snapshot.time - this.delay;
    this.latestTime = Math.max(this.latestTime, snapshot.time);

    for (const kart of snapshot.karts) {
      let arr = this.buffers.get(kart.id);
      if (!arr) { arr = []; this.buffers.set(kart.id, arr); }
      const sample = {
        t: snapshot.time,
        x: kart.x, z: kart.z, heading: kart.heading, speed: kart.speed,
        steerVisual: kart.steerVisual || 0, wheelSpin: kart.wheelSpin || 0,
        turboState: kart.turboState, offRoad: kart.offRoad,
        laps: kart.laps, nextGate: kart.nextGate, finished: kart.finished,
        position: kart.position, finishPlace: kart.finishPlace,
        finishTime: kart.finishTime, cpValidated: kart.cpValidated
      };
      if (arr.length && Math.abs(arr[arr.length - 1].t - snapshot.time) < 1e-6) {
        arr[arr.length - 1] = sample;
      } else {
        arr.push(sample);
      }
      if (arr.length > this.maxSamples) arr.splice(0, arr.length - this.maxSamples);
    }
  }

  /** Avanza el reloj de render y lo corrige suavemente hacia el servidor. */
  advance(dt) {
    if (this.renderTime === null) return;
    this.renderTime += dt;
    const target = this.latestTime - this.delay;
    const err = target - this.renderTime;
    if (Math.abs(err) > 1.0) this.renderTime = target;
    else this.renderTime += err * Math.min(1, dt * 1.5);

    if (this.renderTime < this.latestTime - 2.5) this.renderTime = target;
  }

  /** Devuelve el estado visual interpolado de un kart. */
  sample(id) {
    const arr = this.buffers.get(id);
    if (!arr || arr.length === 0) return null;
    const t = this.renderTime === null ? arr[arr.length - 1].t : this.renderTime;

    if (t <= arr[0].t) return Object.assign({}, arr[0]);
    if (t >= arr[arr.length - 1].t) return Object.assign({}, arr[arr.length - 1]);

    let lo = 0, hi = arr.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = arr[lo], b = arr[hi];
    const span = (b.t - a.t) || 1;
    const f = clamp((t - a.t) / span, 0, 1);

    return {
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
      heading: a.heading + wrapAngle(b.heading - a.heading) * f,
      speed: a.speed + (b.speed - a.speed) * f,
      steerVisual: a.steerVisual + (b.steerVisual - a.steerVisual) * f,
      wheelSpin: a.wheelSpin + (b.wheelSpin - a.wheelSpin) * f,
      turboState: f < 0.5 ? a.turboState : b.turboState,
      offRoad: b.offRoad,
      laps: b.laps, nextGate: b.nextGate, finished: b.finished,
      position: b.position, finishPlace: b.finishPlace,
      finishTime: b.finishTime, cpValidated: b.cpValidated
    };
  }

  ids() {
    return [...this.buffers.keys()];
  }
}