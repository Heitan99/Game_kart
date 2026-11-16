/* =====================================================================
   KART CAMPUS — simulación autoritativa por sala
   El servidor crea un GameSimulation por sala. Solo aquí se decide la
   posición real, las colisiones, los checkpoints, las vueltas, la
   clasificación y el resultado final. Los clientes nunca dictan estos
   datos: únicamente envían entradas de conducción.
   ===================================================================== */
import { CONFIG, STATE, AI_NAMES, KART_COLORS } from '../../shared/GameConfig.js';
import { createTrackData } from '../../shared/TrackGeometry.js';
import {
  makeKartState, placeKartOnGrid, computeAIInput,
  updateTurboState, applyPhysics, resolveCollisions
} from '../../shared/Physics.js';
import { checkGates, updateKartProgress, computeStandings } from '../../shared/RaceRules.js';
import { encodeSnapshot } from '../../shared/Protocol.js';

let AI_PROFILES = null;

/** Perfiles de IA ligeramente distintos para dar variedad. */
function aiProfiles() {
  if (AI_PROFILES) return AI_PROFILES;
  AI_PROFILES = [
    { lane: 2.7, speedScale: 0.955, accelScale: 0.98, lookahead: 13.5, steerGain: 2.25, curveBrake: 1.08 },
    { lane: -2.7, speedScale: 0.925, accelScale: 1.0, lookahead: 12.5, steerGain: 2.45, curveBrake: 1.22 },
    { lane: 1.4, speedScale: 0.94, accelScale: 0.99, lookahead: 13.0, steerGain: 2.3, curveBrake: 1.12 },
    { lane: -1.4, speedScale: 0.91, accelScale: 1.0, lookahead: 12.0, steerGain: 2.5, curveBrake: 1.25 },
    { lane: 3.6, speedScale: 0.9, accelScale: 1.0, lookahead: 12.8, steerGain: 2.4, curveBrake: 1.18 },
    { lane: -3.6, speedScale: 0.96, accelScale: 0.97, lookahead: 13.2, steerGain: 2.2, curveBrake: 1.05 },
    { lane: 0, speedScale: 0.88, accelScale: 1.0, lookahead: 12.2, steerGain: 2.55, curveBrake: 1.3 },
    { lane: 2.0, speedScale: 0.93, accelScale: 0.99, lookahead: 12.7, steerGain: 2.35, curveBrake: 1.15 }
  ];
  return AI_PROFILES;
}

export class GameSimulation {
  constructor(config = CONFIG) {
    this.config = config;
    this.track = createTrackData(config);
    this.karts = [];
    this.kartById = new Map();
    this.race = {
      state: STATE.MENU,
      time: 0,
      countdown: 0,
      goTimer: 0,
      finishCount: 0,
      standings: []
    };
    this.aiCounter = 0;
    this.tickCount = 0;
  }

  /**
   * Reconstruye la parrilla a partir de los jugadores actuales de la sala.
   * @param {Array} humans [{id,name,colorHex}]
   * @param {number} aiCount
   * @param {number} colorOffset
   */
  lineup(humans, aiCount = 0, colorOffset = 0) {
    this.karts = [];
    this.kartById.clear();
    this.aiCounter = 0;
    this.race = { state: STATE.MENU, time: 0, countdown: 0, goTimer: 0, finishCount: 0, standings: [] };

    let slot = 0;
    for (const h of humans) {
      const kart = makeKartState({
        id: h.id,
        name: h.name,
        colorHex: h.colorHex,
        isHuman: true,
        gridSlot: slot++
      });
      placeKartOnGrid(kart, this.track, this.config);
      this.karts.push(kart);
      this.kartById.set(kart.id, kart);
    }

    for (let i = 0; i < aiCount && this.karts.length < this.config.network.maxPlayers; i++) {
      const profile = aiProfiles()[this.aiCounter % aiProfiles().length];
      const name = AI_NAMES[(this.aiCounter + colorOffset) % AI_NAMES.length];
      const kart = makeKartState({
        id: 'ai:' + (this.aiCounter + 1),
        name: name,
        colorHex: KART_COLORS[(this.aiCounter + colorOffset + humans.length) % KART_COLORS.length],
        isHuman: false,
        gridSlot: slot++
      });
      kart.ai.lane = profile.lane;
      kart.ai.speedScale = profile.speedScale;
      kart.ai.accelScale = profile.accelScale;
      kart.ai.lookahead = profile.lookahead;
      kart.ai.steerGain = profile.steerGain;
      kart.ai.curveBrake = profile.curveBrake;
      placeKartOnGrid(kart, this.track, this.config);
      this.karts.push(kart);
      this.kartById.set(kart.id, kart);
      this.aiCounter++;
    }

    this.race.standings = computeStandings(this.karts);
    return this.karts;
  }

  /** Inicia la cuenta atrás de 3 s. */
  start() {
    this.race.state = STATE.COUNTDOWN;
    this.race.countdown = this.config.race.countdown;
    this.race.time = 0;
    this.race.goTimer = 0;
    this.race.finishCount = 0;
    this.tickCount = 0;
    return this.race;
  }

  /** Guarda la última entrada válida de un jugador humano. */
  setInput(playerId, input) {
    const k = this.kartById.get(playerId);
    if (!k || !k.isHuman) return false;
    if (k.finished) return false;
    k.input.throttle = input.throttle;
    k.input.brake = input.brake;
    k.input.steer = input.steer;
    if (input.turbo) k.input.turbo = true;
    return true;
  }

  /** Marca a un humano como desconectado (la IA toma el control) o reconectado. */
  setDisconnected(playerId, disconnected) {
    const k = this.kartById.get(playerId);
    if (!k) return false;
    k.disconnected = !!disconnected;
    if (disconnected) {
      k.input.throttle = 0;
      k.input.brake = 0;
      k.input.steer = 0;
      k.input.turbo = false;
    }
    return true;
  }

  /** Un paso fijo autoritativo. */
  tick(dt) {
    dt = Math.min(dt, this.config.physics.maxDt);
    const r = this.race;

    if (r.state === STATE.COUNTDOWN) {
      r.countdown -= dt;
      if (r.countdown <= 0) {
        r.countdown = 0;
        r.state = STATE.RACING;
        r.time = 0;
        r.goTimer = this.config.race.goDisplayTime;
      }
      return;
    }
    if (r.state !== STATE.RACING) return;

    r.time += dt;
    if (r.goTimer > 0) r.goTimer -= dt;

    // 1) entradas: los humanos usan su última entrada; los desconectados e IA, la IA.
    for (const k of this.karts) {
      if (k.finished) {
        k.input.throttle = 0; k.input.brake = 0;
        k.input.steer = 0; k.input.turbo = false;
        k.speed = 0;
        continue;
      }
      if (!k.isHuman || k.disconnected) {
        computeAIInput(k, this.track, dt, true, this.config);
      }
      updateTurboState(k, dt, this.config);
    }

    // 2) física
    for (const k of this.karts) {
      k.prevX = k.x; k.prevZ = k.z; k.prevS = k.s;
      applyPhysics(k, dt, this.config);
    }

    // 3) colisiones
    resolveCollisions(this.karts, this.config);

    // 4) puertas, progreso y clasificación
    for (const k of this.karts) {
      checkGates(k, this.track, k.prevX, k.prevZ, k.x, k.z, r, this.config);
      updateKartProgress(k, this.track, dt, this.config);
    }
    r.standings = computeStandings(this.karts);
    this.tickCount++;

    // 5) fin de carrera cuando todos han terminado.
    if (this.karts.length > 0 && this.karts.every(function (k) { return k.finished; })) {
      r.state = STATE.RESULTS;
    }
    return r;
  }

  /** Snapshot compacto para la red. */
  snapshot() {
    return encodeSnapshot(this.race, this.karts);
  }

  /** Estado completo para (re)incorporar a un jugador. */
  fullState() {
    return {
      trackLength: this.track.length,
      race: {
        state: this.race.state,
        time: this.race.time,
        countdown: this.race.countdown,
        laps: this.config.race.laps,
        checkpoints: this.config.race.checkpoints
      },
      karts: this.karts.map(function (k) {
        return {
          id: k.id, name: k.name, colorHex: k.colorHex, isHuman: k.isHuman,
          x: k.x, z: k.z, heading: k.heading, speed: k.speed,
          nextGate: k.nextGate, laps: k.laps, finished: k.finished,
          finishPlace: k.finishPlace, finishTime: k.finishTime,
          position: k.position, cpValidated: k.cpValidated,
          turboState: k.turboState, turboTimer: k.turboTimer,
          offRoad: k.offRoad
        };
      })
    };
  }

  /** Resultados finales calculados en el servidor. */
  results() {
    const ordered = computeStandings(this.karts);
    return ordered.map(function (k, i) {
      return {
        position: k.finished ? k.finishPlace : i + 1,
        id: k.id,
        name: k.name,
        colorHex: k.colorHex,
        isHuman: k.isHuman,
        finished: k.finished,
        finishTime: k.finished ? k.finishTime : 0,
        laps: k.laps,
        cpValidated: k.cpValidated,
        nextGate: k.nextGate,
        bestLap: k.bestLap || 0
      };
    });
  }

  allFinished() {
    return this.karts.length > 0 && this.karts.every(function (k) { return k.finished; });
  }
}