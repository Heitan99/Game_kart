export class PlayerController {
  constructor(kartId, config) {
    this.kartId = kartId;
    this.config = config;
    this.input = { throttle: 0, brake: 0, steer: 0, turbo: false };
    this.turboLatch = false;
    this.prevTurbo = false;
    this.seq = 0;
  }

  /** Actualiza la entrada a partir del estado combinado de controles. */
  setControls(state) {
    const turboDown = !!state.turbo;
    if (turboDown && !this.prevTurbo) this.turboLatch = true;
    this.prevTurbo = turboDown;

    this.input.throttle = clamp01(state.throttle);
    this.input.brake = clamp01(state.brake);
    this.input.steer = Math.max(-1, Math.min(1, Number(state.steer) || 0));
    this.input.turbo = this.turboLatch;
  }

  /** Entrada para un paso de predicción/simulación local. */
  stepInput() {
    const turbo = this.turboLatch;
    this.input.turbo = turbo;
    return this.input;
  }

  /** Entrada para enviar por red; incluye el turbo pendiente. */
  networkInput() {
    this.seq++;
    return {
      seq: this.seq,
      throttle: this.input.throttle,
      brake: this.input.brake,
      steer: this.input.steer,
      turbo: this.turboLatch
    };
  }

  consumeTurbo() {
    this.turboLatch = false;
    this.input.turbo = false;
  }

  reset() {
    this.input.throttle = 0;
    this.input.brake = 0;
    this.input.steer = 0;
    this.input.turbo = false;
    this.turboLatch = false;
    this.prevTurbo = false;
    this.seq = 0;
  }
}

function clamp01(v) {
  v = Number(v) || 0;
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}