import { CONFIG, STATE } from '../../shared/GameConfig.js';
import { GameSimulation } from './GameSimulation.js';
import { EV } from '../../shared/Protocol.js';

const RACE_TIMEOUT = 300; // segundos de seguridad para evitar carreras infinitas

export class RaceManager {
  constructor({ roomManager, broadcastRoom, config = CONFIG, logger = console }) {
    this.roomManager = roomManager;
    this.broadcastRoom = broadcastRoom;
    this.config = config;
    this.logger = logger;
    this.tickMs = 1000 / 60;
  }

  /** Crea la simulación y arranca la cuenta atrás para una sala. */
  start(room) {
    this.stop(room);
    const humans = this.roomManager.racers(room);
    const sim = new GameSimulation(this.config);
    sim.lineup(
      humans.map(function (p) {
        return { id: p.id, name: p.name, colorHex: p.colorHex };
      }),
      room.aiCount || 0,
      0
    );
    room.sim = sim;
    room.state = 'countdown';
    sim.start();

    this.broadcastRoom(room.code, EV.RACE_START, {
      serverTime: Date.now(),
      countdown: sim.race.countdown,
      laps: this.config.race.laps,
      checkpoints: this.config.race.checkpoints,
      fixedDt: this.config.physics.fixedDt,
      karts: sim.fullState().karts
    });
    this.loop(room);
  }

  /** Reinicia la carrera conservando a los jugadores actuales. */
  restart(room) {
    room.state = 'lobby';
    this.start(room);
  }

  loop(room) {
    let last = Date.now();
    let acc = 0;
    let snapAcc = 0;
    const fixed = this.config.physics.fixedDt;
    const snapInterval = 1 / this.config.network.snapshotRate;
    const maxSub = this.config.physics.maxSubsteps;

    const handle = setInterval(() => {
      const now = Date.now();
      let dt = (now - last) / 1000;
      last = now;
      if (!isFinite(dt) || dt <= 0) dt = this.tickMs / 1000;
      dt = Math.min(dt, 0.25); // evita saltos tras pausas del proceso

      acc += dt;
      let steps = 0;
      while (acc >= fixed && steps < maxSub) {
        room.sim.tick(fixed);
        acc -= fixed;
        steps++;
      }
      if (steps >= maxSub) acc = 0;

      snapAcc += dt;
      if (snapAcc >= snapInterval) {
        snapAcc = 0;
        this.broadcastRoom(room.code, EV.SNAPSHOT, room.sim.snapshot());
      }

      if (room.sim.race.state === STATE.RESULTS || room.sim.race.time > RACE_TIMEOUT) {
        this.stop(room);
        room.state = 'results';
        this.broadcastRoom(room.code, EV.RACE_FINISH, {
          results: room.sim.results(),
          raceTime: room.sim.race.time,
          serverTime: Date.now()
        });
      }
    }, this.tickMs);

    if (handle.unref) handle.unref();
    room.loop = handle;
  }

  stop(room) {
    if (room.loop) {
      clearInterval(room.loop);
      room.loop = null;
    }
  }

  handleInput(room, playerId, input) {
    if (!room.sim) return false;
    if (room.sim.race.state !== STATE.RACING) return false;
    return room.sim.setInput(playerId, input);
  }

  handleDisconnect(room, playerId) {
    if (!room.sim) return;
    room.sim.setDisconnected(playerId, true);
  }

  handleReconnect(room, playerId) {
    if (!room.sim) return;
    room.sim.setDisconnected(playerId, false);
  }
}