import { CONFIG, clamp, wrapAngle } from '../../../shared/GameConfig.js';
import { makeKartState, applyPhysics, updateTurboState } from '../../../shared/Physics.js';
import { projectToTrack } from '../../../shared/TrackGeometry.js';

export class PlayerSync {
  constructor({ playerId, track, config = CONFIG, name = 'TÚ', colorHex = 0x2fe3ff }) {
    this.playerId = playerId;
    this.track = track;
    this.config = config;
    this.kart = makeKartState({ id: playerId, name, colorHex, isHuman: true, isPlayer: true });
    this.kart.isPlayer = true;
    this.initialized = false;
    this.correctionEvents = 0;
  }

  /** Inicializa desde el estado completo de race:start. */
  initFrom(fullKart) {
    if (!fullKart) return;
    const k = this.kart;
    k.id = fullKart.id;
    k.name = fullKart.name;
    k.colorHex = fullKart.colorHex;
    k.x = fullKart.x; k.z = fullKart.z; k.heading = fullKart.heading;
    k.speed = 0;
    k.prevX = k.x; k.prevZ = k.z;
    k.laps = fullKart.laps || 0;
    k.nextGate = fullKart.nextGate || 1;
    k.finished = !!fullKart.finished;
    k.finishPlace = fullKart.finishPlace || 0;
    k.finishTime = fullKart.finishTime || 0;
    k.cpValidated = fullKart.cpValidated || 0;
    k.turboState = 'ready'; k.turboTimer = 0;
    k.offRoad = false;
    k.steerVisual = 0; k.wheelSpin = 0;
    k.trackHint = 0;
    k.input.throttle = 0; k.input.brake = 0; k.input.steer = 0; k.input.turbo = false;
    const pr = projectToTrack(this.track, k.x, k.z, 0);
    k.trackHint = pr.index;
    this.initialized = true;
  }

  /** Un paso de predicción local (misma física que el servidor). */
  step(dt, input) {
    if (!this.initialized) return;
    const k = this.kart;
    if (k.finished) return;
    k.input.throttle = input.throttle | 0;
    k.input.brake = input.brake | 0;
    k.input.steer = input.steer;
    k.input.turbo = !!input.turbo;

    updateTurboState(k, dt, this.config);
    k.prevX = k.x; k.prevZ = k.z; k.prevS = k.s;
    applyPhysics(k, dt, this.config);

    const pr = projectToTrack(this.track, k.x, k.z, k.trackHint);
    k.trackHint = pr.index;
    k.s = pr.s;
    k.lateral = pr.lateral;
    k.offRoad = Math.abs(pr.lateral) > this.track.halfWidth + 0.55;
  }

  /** Reconcilia la predicción con el estado autoritativo del servidor. */
  reconcile(auth) {
    if (!auth || !this.initialized) return;
    const k = this.kart;

    // Campos de carrera: SIEMPRE autoritativos.
    k.laps = auth.laps;
    k.nextGate = auth.nextGate;
    k.position = auth.position;
    k.finished = auth.finished;
    k.finishPlace = auth.finishPlace;
    k.finishTime = auth.finishTime;
    k.cpValidated = auth.cpValidated;
    k.offRoad = auth.offRoad;

    if (auth.finished) {
      k.x = auth.x; k.z = auth.z; k.heading = auth.heading; k.speed = auth.speed;
      return;
    }

    const dx = auth.x - k.x;
    const dz = auth.z - k.z;
    const dist = Math.hypot(dx, dz);
    const dh = Math.abs(wrapAngle(auth.heading - k.heading));

    if (dist > 3.0 || dh > 0.8) {
      // Diferencia grande: corrección dura.
      k.x = auth.x; k.z = auth.z; k.heading = auth.heading; k.speed = auth.speed;
      this.correctionEvents++;
    } else {
      // Diferencia pequeña: corrección progresiva.
      const f = clamp(0.28, 0, 1);
      k.x += dx * f;
      k.z += dz * f;
      k.heading += wrapAngle(auth.heading - k.heading) * f;
      k.speed += (auth.speed - k.speed) * 0.5;
    }
  }

  get state() {
    return this.kart;
  }
}