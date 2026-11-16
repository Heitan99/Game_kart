/* =====================================================================
   KART CAMPUS — física arcade compartida
   La MISMA función de simulación se ejecuta en el cliente (predicción y
   modo individual) y en el servidor (autoridad). Cualquier cambio aquí
   afecta a ambos, garantizando compatibilidad de reglas.
   ===================================================================== */
import { CONFIG, clamp, wrapAngle } from './GameConfig.js';
import { sampleTrackAtS } from './TrackGeometry.js';

/**
 * Crea el estado lógico de un kart.
 * @param {object} opts { id, name, colorHex, isHuman, gridSlot }
 */
export function makeKartState(opts) {
  opts = opts || {};
  return {
    id: opts.id,
    name: opts.name || 'PILOTO',
    colorHex: opts.colorHex !== undefined ? opts.colorHex : 0x2fe3ff,
    isHuman: !!opts.isHuman,
    isPlayer: !!opts.isPlayer,
    gridSlot: opts.gridSlot || 0,
    x: 0, z: 0, heading: 0, speed: 0,
    steerVisual: 0, wheelSpin: 0,
    radius: CONFIG.kart.radius,
    maxSpeed: CONFIG.kart.maxSpeed,
    accel: CONFIG.kart.accel,
    prevX: 0, prevZ: 0,
    s: 0, prevS: 0, lateral: 0, offRoad: false, trackHint: 0,
    traveled: 0, progress: 0, position: 1,
    laps: 0, nextGate: 1, finished: false,
    finishTime: 0, finishPlace: 0,
    lapStartTime: 0, bestLap: 0,
    turboState: 'ready', turboTimer: 0, turboUses: 0,
    cpValidated: 0, invalidFinishAttempts: 0,
    stuckTimer: 0, reverseTimer: 0,
    input: { throttle: 0, brake: 0, steer: 0, turbo: false },
    ai: {
      lane: 0, speedScale: 1, accelScale: 1,
      lookahead: CONFIG.ai.lookahead, steerGain: CONFIG.ai.steerGain,
      curveBrake: CONFIG.ai.curveBrake
    }
  };
}

/** Coloca un kart en su posición de parrilla y reinicia su estado de carrera. */
export function placeKartOnGrid(k, track, config = CONFIG) {
  const slot = config.race.grid[k.gridSlot % config.race.grid.length];
  const s = track.length - slot.back;
  const sm = sampleTrackAtS(track, s);
  k.x = sm.x + sm.nx * slot.lateral;
  k.z = sm.z + sm.nz * slot.lateral;
  k.heading = Math.atan2(sm.tx, sm.tz);
  k.speed = 0;
  k.steerVisual = 0;
  k.wheelSpin = 0;
  k.prevX = k.x; k.prevZ = k.z;
  k.s = s; k.prevS = s;
  k.lateral = slot.lateral;
  k.offRoad = false;
  k.trackHint = 0;
  // El progreso arranca en negativo: la parrilla está detrás de la meta.
  k.traveled = -slot.back; k.progress = -slot.back;
  k.laps = 0; k.nextGate = 1;
  k.finished = false; k.finishTime = 0; k.finishPlace = 0;
  k.lapStartTime = 0; k.bestLap = 0;
  k.turboState = 'ready'; k.turboTimer = 0; k.turboUses = 0;
  k.cpValidated = 0; k.invalidFinishAttempts = 0;
  k.stuckTimer = 0; k.reverseTimer = 0;
  k.input.throttle = 0; k.input.brake = 0; k.input.steer = 0; k.input.turbo = false;
  return k;
}

/** IA: calcula la entrada de conducción mirando el eje por delante. */
export function computeAIInput(k, track, dt, racing, config = CONFIG) {
  if (k.finished) {
    k.input.throttle = 0.35; k.input.brake = 0; k.input.steer = k.input.steer * 0.9; k.input.turbo = false;
    return;
  }
  const ai = k.ai;

  if (racing && Math.abs(k.speed) < 1.2) k.stuckTimer += dt;
  else k.stuckTimer = Math.max(0, k.stuckTimer - dt * 1.4);

  if (k.reverseTimer > 0) k.reverseTimer -= dt;
  else if (k.stuckTimer > 2.2) { k.reverseTimer = 1.25; k.stuckTimer = 0; }

  const tgt = sampleTrackAtS(track, k.s + ai.lookahead);
  const lane = k.offRoad ? 0 : ai.lane;
  const tx = tgt.x + tgt.nx * lane;
  const tz = tgt.z + tgt.nz * lane;
  const desired = Math.atan2(tx - k.x, tz - k.z);
  const diff = wrapAngle(desired - k.heading);
  let steer = clamp(diff * ai.steerGain, -1, 1);

  const a = sampleTrackAtS(track, k.s + 8);
  const b = sampleTrackAtS(track, k.s + 30);
  const curve = Math.abs(wrapAngle(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)));

  let targetSpeed = k.maxSpeed * ai.speedScale * (1 - clamp(curve * ai.curveBrake, 0, 0.62));
  targetSpeed *= (1 - clamp(Math.abs(diff) * 0.55, 0, 0.4));
  if (k.offRoad) targetSpeed *= 0.6;

  let throttle = clamp((targetSpeed - k.speed) / 6 + 0.6, 0, 1);
  let brake = clamp((k.speed - targetSpeed) / 5, 0, 1);

  if (k.reverseTimer > 0) {
    throttle = 0; brake = 1; steer = -steer;
  }

  k.input.throttle = throttle;
  k.input.brake = brake;
  k.input.steer = steer;
  k.input.turbo = (k.turboState === 'ready' && curve < 0.12 && k.speed > k.maxSpeed * 0.65 && k.reverseTimer <= 0);
}

/** Avanza el estado del turbo (activo → recarga → listo) y consume la petición. */
export function updateTurboState(k, dt, config = CONFIG) {
  if (k.turboState === 'active') {
    k.turboTimer -= dt;
    if (k.turboTimer <= 0) {
      k.turboState = 'recharging';
      k.turboTimer = config.turbo.recharge;
    }
  } else if (k.turboState === 'recharging') {
    k.turboTimer -= dt;
    if (k.turboTimer <= 0) {
      k.turboState = 'ready';
      k.turboTimer = 0;
    }
  }
  if (k.input.turbo && k.turboState === 'ready') {
    k.turboState = 'active';
    k.turboTimer = config.turbo.duration;
    k.turboUses++;
  }
}

/** Integra velocidad, giro y posición de un kart para un paso fijo. */
export function applyPhysics(k, dt, config = CONFIG) {
  const inp = k.input;
  k.steerVisual += (inp.steer - k.steerVisual) * Math.min(1, config.kart.steerSmoothing * dt);

  const speedAbs = Math.abs(k.speed);
  const speedFactor = Math.min(speedAbs / config.kart.turnSpeedRef, 1);
  const dirSign = k.speed >= 0 ? 1 : -1;
  // Convención: steer positivo gira a la IZQUIERDA (heading aumenta).
  // La cámara va detrás mirando en +forward, por lo que +heading se ve como
  // un giro a la izquierda en pantalla. Los controles del jugador ya envían
  // el signo correcto (izquierda = +1, derecha = -1).
  k.heading += k.steerVisual * config.kart.turnRate * speedFactor * dirSign * dt;

  const turboOn = k.turboState === 'active';
  const maxSpeed = k.maxSpeed *
    (turboOn ? config.turbo.speedMultiplier : 1) *
    (k.offRoad ? config.kart.offRoadSpeedFactor : 1);
  const accel = k.accel * (turboOn ? config.turbo.accelMultiplier : 1);

  if (inp.throttle > 0) k.speed += accel * k.ai.accelScale * inp.throttle * dt;
  if (inp.brake > 0) {
    if (k.speed > 0.25) k.speed -= config.kart.brake * inp.brake * dt;
    else k.speed -= config.kart.reverseAccel * inp.brake * dt;
  }
  if (inp.throttle <= 0 && inp.brake <= 0) {
    const f = config.kart.friction * dt;
    if (k.speed > 0) k.speed = Math.max(0, k.speed - f);
    else if (k.speed < 0) k.speed = Math.min(0, k.speed + f);
  }
  if (k.offRoad) {
    // En reversa el arrastre fuera de pista se reduce: si no, los 34 m/s² de
    // offRoadDrag superan los 16 m/s² de reverseAccel y el kart queda clavado
    // en el césped sin poder volver a la pista.
    const dragRate = k.speed < 0 ? config.kart.offRoadDrag * 0.3 : config.kart.offRoadDrag;
    const drag = dragRate * dt;
    if (k.speed > 0) k.speed = Math.max(0, k.speed - drag);
    else if (k.speed < 0) k.speed = Math.min(0, k.speed + drag);
  }
  if (k.speed > maxSpeed) k.speed = Math.max(maxSpeed, k.speed - 34 * dt);
  if (k.speed < -config.kart.reverseMax) k.speed = -config.kart.reverseMax;

  const fx = Math.sin(k.heading);
  const fz = Math.cos(k.heading);
  k.x += fx * k.speed * dt;
  k.z += fz * k.speed * dt;

  k.wheelSpin += (k.speed * dt) / config.kart.wheelRadius;
}

/** Resuelve solapamientos entre karts (separación + pérdida de velocidad). */
export function resolveCollisions(karts, config = CONFIG) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      const minD = a.radius + b.radius;
      if (d < 0.0001) {
        a.x -= 0.6; b.x += 0.6;
        dx = b.x - a.x; dz = b.z - a.z; d = Math.hypot(dx, dz);
      }
      if (d < minD) {
        const nx = dx / d, nz = dz / d;
        const overlap = minD - d;
        const corr = overlap * 0.5 + 0.002;
        a.x -= nx * corr; a.z -= nz * corr;
        b.x += nx * corr; b.z += nz * corr;
        const impact = Math.min(0.12, overlap * 0.09);
        a.speed *= (1 - impact);
        b.speed *= (1 - impact);
      }
    }
  }
  return karts;
}