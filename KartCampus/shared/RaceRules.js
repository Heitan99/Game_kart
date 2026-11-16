/* =====================================================================
   KART CAMPUS — reglas de carrera compartidas
   Checkpoints ordenados, vueltas, finalización y clasificación.
   El servidor ejecuta estas reglas como autoridad; el cliente las usa
   para el modo individual y para predicción visual.
   ===================================================================== */
import { CONFIG, wrapDelta } from './GameConfig.js';
import { projectToTrack } from './TrackGeometry.js';

/**
 * Detecta cruces válidos de puertas entre el paso anterior y el actual.
 * Solo cuenta cruces hacia adelante, dentro del ancho de pista y con un
 * salto pequeño (anti-trampas / anti-teleport).
 */
export function checkGates(k, track, px, pz, cx, cz, race, config = CONFIG) {
  const maxStep = config.race.gateMaxStep;
  for (const g of track.gates) {
    const dPrev = (px - g.x) * g.tx + (pz - g.z) * g.tz;
    const dCur = (cx - g.x) * g.tx + (cz - g.z) * g.tz;
    if (dPrev < 0 && dCur >= 0 && (dCur - dPrev) < maxStep && (-dPrev) < maxStep) {
      const latPrev = (px - g.x) * g.nx + (pz - g.z) * g.nz;
      const latCur = (cx - g.x) * g.nx + (cz - g.z) * g.nz;
      if (Math.abs(latPrev) <= g.halfWidth && Math.abs(latCur) <= g.halfWidth) {
        onGateCrossed(k, g, race, config);
      }
    }
  }
}

/** Aplica la lógica de una puerta cruzada (checkpoint o meta). */
export function onGateCrossed(k, g, race, config = CONFIG) {
  if (g.isFinish) {
    if (k.nextGate === 0) {
      k.laps++;
      const lapTime = race.time - k.lapStartTime;
      k.lapStartTime = race.time;
      if (lapTime > 0 && (!k.bestLap || lapTime < k.bestLap)) k.bestLap = lapTime;
      k.nextGate = 1;
      if (k.laps >= config.race.laps) finishKart(k, race);
    } else {
      k.invalidFinishAttempts++;
    }
  } else {
    if (k.nextGate === g.cpIndex) {
      k.nextGate = g.cpIndex + 1;
      k.cpValidated++;
      if (k.nextGate > config.race.checkpoints) k.nextGate = 0;
    }
  }
}

/** Marca un kart como finalizado y le asigna plaza según orden de llegada. */
export function finishKart(k, race) {
  if (k.finished) return;
  k.finished = true;
  k.finishTime = race.time;
  race.finishCount = (race.finishCount || 0) + 1;
  k.finishPlace = race.finishCount;
  k.input.throttle = 0;
  k.input.brake = 0.4;
  k.input.steer = 0;
  k.input.turbo = false;
}

/**
 * Actualiza la proyección, el estado fuera de pista y el progreso de un
 * kart. `traveled` integra la distancia recorrida sobre el eje para una
 * clasificación estable desde la parrilla.
 */
export function updateKartProgress(k, track, dt, config = CONFIG) {
  const pr = projectToTrack(track, k.x, k.z, k.trackHint);
  k.trackHint = pr.index;
  k.s = pr.s;
  k.lateral = pr.lateral;
  k.offRoad = Math.abs(pr.lateral) > track.halfWidth + 0.55;
  const ds = wrapDelta(k.s - k.prevS, track.length);
  const maxDs = k.maxSpeed * 2.2 * dt + 1.5;
  if (Math.abs(ds) <= maxDs) k.traveled += ds;
  k.progress = k.traveled;
  return pr;
}

/** Ordena karts: finalizados por plaza y el resto por progreso. */
export function computeStandings(karts) {
  const arr = karts.slice();
  arr.sort(function (a, b) {
    if (a.finished && b.finished) return a.finishPlace - b.finishPlace;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  for (let i = 0; i < arr.length; i++) arr[i].position = i + 1;
  return arr;
}

/**
 * Un paso completo de carrera para una lista de karts.
 * `inputProvider(kart, dt)` debe rellenar kart.input antes de la física.
 */
export function stepRace(karts, track, race, dt, inputProvider, config = CONFIG) {
  for (const k of karts) {
    inputProvider(k, dt);
    updateTurboState(k, dt, config);
  }
  for (const k of karts) {
    k.prevX = k.x;
    k.prevZ = k.z;
    k.prevS = k.s;
    applyPhysicsForStep(k, dt, config);
  }
  resolveCollisionsForStep(karts, config);
  for (const k of karts) {
    checkGates(k, track, k.prevX, k.prevZ, k.x, k.z, race, config);
    updateKartProgress(k, track, dt, config);
  }
  race.standings = computeStandings(karts);
  return race.standings;
}

/* Importaciones locales para evitar ciclos en algunos bundlers. */
import { applyPhysics as applyPhysicsForStep, resolveCollisions as resolveCollisionsForStep, updateTurboState } from './Physics.js';