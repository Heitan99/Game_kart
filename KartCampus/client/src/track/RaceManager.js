/* =====================================================================
   KART CAMPUS — carrera individual (cliente)
   Orquesta una carrera local con la MISMA física y reglas que el
   servidor (módulos compartidos). Se usa en el modo individual; en
   online la autoridad recae en GameSimulation del servidor.
   ===================================================================== */
import { CONFIG, STATE, KART_COLORS, AI_NAMES } from '../core/Config.js';
import {
  makeKartState, placeKartOnGrid, computeAIInput, updateTurboState, applyPhysics, resolveCollisions
} from '/shared/Physics.js';
import { checkGates, updateKartProgress, computeStandings } from '/shared/RaceRules.js';
import { AIController } from '../vehicles/AIController.js';

const AI_PROFILES = [
  { lane: 2.7, speedScale: 0.955, accelScale: 0.98, lookahead: 13.5, steerGain: 2.25, curveBrake: 1.08 },
  { lane: -2.7, speedScale: 0.925, accelScale: 1.0, lookahead: 12.5, steerGain: 2.45, curveBrake: 1.22 },
  { lane: 1.4, speedScale: 0.94, accelScale: 0.99, lookahead: 13.0, steerGain: 2.3, curveBrake: 1.12 },
  { lane: -1.4, speedScale: 0.91, accelScale: 1.0, lookahead: 12.0, steerGain: 2.5, curveBrake: 1.25 },
  { lane: 3.6, speedScale: 0.9, accelScale: 1.0, lookahead: 12.8, steerGain: 2.4, curveBrake: 1.18 },
  { lane: -3.6, speedScale: 0.96, accelScale: 0.97, lookahead: 13.2, steerGain: 2.2, curveBrake: 1.05 },
  { lane: 0, speedScale: 0.88, accelScale: 1.0, lookahead: 12.2, steerGain: 2.55, curveBrake: 1.3 },
  { lane: 2.0, speedScale: 0.93, accelScale: 0.99, lookahead: 12.7, steerGain: 2.35, curveBrake: 1.15 }
];

export class SoloRaceManager {
  /**
   * @param {object} opts { track, config, playerName, colorHex }
   */
  constructor({ track, config = CONFIG, playerName = 'TÚ', colorHex = 0x2fe3ff } = {}) {
    this.trackData = track && track.data ? track.data : track;
    this.config = config;
    this.playerName = playerName;
    this.colorHex = colorHex;
    this.ai = new AIController(config);
    this.track = this.trackData;

    this.race = {
      state: STATE.MENU,
      time: 0,
      countdown: 0,
      goTimer: 0,
      finishCount: 0,
      standings: []
    };
    this.karts = [];
    this.player = null;
    this.profiles = AI_PROFILES;
  }

  /** Crea al jugador + rivales IA y los coloca en parrilla. */
  setup(aiCount = 2) {
    this.karts = [];
    this.race = {
      state: STATE.MENU, time: 0, countdown: 0, goTimer: 0, finishCount: 0, standings: []
    };

    const player = makeKartState({
      id: 'solo:player', name: this.playerName, colorHex: this.colorHex,
      isHuman: true, isPlayer: true, gridSlot: 0
    });
    placeKartOnGrid(player, this.track, this.config);
    this.karts.push(player);
    this.player = player;

    const names = AI_NAMES.slice();
    for (let i = 0; i < aiCount; i++) {
      const profile = this.profiles[i % this.profiles.length];
      const kart = makeKartState({
        id: 'solo:ai' + (i + 1),
        name: names[(i + 1) % names.length],
        colorHex: KART_COLORS[(i + 1) % KART_COLORS.length],
        isHuman: false,
        gridSlot: i + 1
      });
      Object.assign(kart.ai, profile);
      placeKartOnGrid(kart, this.track, this.config);
      this.karts.push(kart);
    }

    this.race.standings = computeStandings(this.karts);
    return this.karts;
  }

  start() {
    this.race.state = STATE.COUNTDOWN;
    this.race.countdown = this.config.race.countdown;
    this.race.time = 0;
    this.race.goTimer = 0;
    this.race.finishCount = 0;
  }

  /**
   * Un paso fijo. `playerInput` debe ser {throttle,brake,steer,turbo}.
   */
  update(dt, playerInput) {
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

    // Entradas
    for (const k of this.karts) {
      if (k.finished) {
        k.input.throttle = 0; k.input.brake = 0; k.input.steer = 0; k.input.turbo = false;
        k.speed = 0;
        continue;
      }
      if (k.isPlayer) {
        const inp = playerInput || {};
        k.input.throttle = clamp01(inp.throttle);
        k.input.brake = clamp01(inp.brake);
        k.input.steer = Math.max(-1, Math.min(1, Number(inp.steer) || 0));
        if (inp.turbo) k.input.turbo = true;
        updateTurboState(k, dt, this.config);
      } else {
        this.ai.update(k, this.track, dt, true);
        updateTurboState(k, dt, this.config);
      }
    }

    // Física
    for (const k of this.karts) {
      k.prevX = k.x; k.prevZ = k.z; k.prevS = k.s;
      applyPhysics(k, dt, this.config);
    }

    resolveCollisions(this.karts, this.config);

    for (const k of this.karts) {
      checkGates(k, this.track, k.prevX, k.prevZ, k.x, k.z, r, this.config);
      updateKartProgress(k, this.track, dt, this.config);
    }
    r.standings = computeStandings(this.karts);

    if (this.karts.length > 0 && this.karts.every((k) => k.finished)) {
      r.state = STATE.RESULTS;
    }
  }

  /** Resultados del modo individual (mismas reglas que el servidor). */
  results() {
    const ordered = computeStandings(this.karts);
    return ordered.map((k, i) => ({
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
    }));
  }

  allFinished() {
    return this.karts.length > 0 && this.karts.every((k) => k.finished);
  }
}

function clamp01(v) {
  v = Number(v) || 0;
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}
