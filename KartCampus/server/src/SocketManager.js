/* =====================================================================
   KART CAMPUS — capa de sockets
   Identidad, validación, rate limiting y cableado de eventos. Ningún
   dato de posición/lap/tiempo enviado por el cliente se acepta: solo
   se aceptan ENTRADAS de conducción saneadas.
   ===================================================================== */
import { CONFIG } from '../../shared/GameConfig.js';
import {
  EV, ERR, validateName, normalizeCode, sanitizeInput
} from '../../shared/Protocol.js';

export class SocketManager {
  constructor({ io, playerManager, roomManager, raceManager, config = CONFIG, logger = console }) {
    this.io = io;
    this.playerManager = playerManager;
    this.roomManager = roomManager;
    this.raceManager = raceManager;
    this.config = config;
    this.logger = logger;
    this.cleanupTimer = null;
  }

  attach() {
    this.io.on('connection', (socket) => this.onConnection(socket));
    this.cleanupTimer = setInterval(() => this.cleanup(), 5000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  onConnection(socket) {
    const auth = (socket.handshake && socket.handshake.auth) || {};
    let player = this.playerManager.getByToken(auth.token);
    let restored = false;

    if (player) {
      const oldSocketId = player.socketId;
      if (oldSocketId && oldSocketId !== socket.id) {
        const old = this.io.sockets.sockets.get(oldSocketId);
        if (old) {
          old.data = old.data || {};
          old.data.replaced = true;
          old.disconnect(true);
        }
      }
      restored = !player.connected || player.roomCode !== null;
      this.playerManager.attach(player, socket.id);
    } else {
      player = this.playerManager.create('PILOTO');
      this.playerManager.attach(player, socket.id);
    }

    socket.data.playerId = player.id;
    socket.data.limits = { input: [], event: [] };
    socket.data.lastSeq = -1;

    socket.emit(EV.WELCOME, {
      playerId: player.id,
      token: player.token,
      name: player.name,
      colorHex: player.colorHex,
      serverTime: Date.now(),
      reconnected: restored,
      network: {
        inputRate: this.config.network.inputRate,
        snapshotRate: this.config.network.snapshotRate,
        maxPlayers: this.config.network.maxPlayers,
        reconnectGrace: this.config.network.reconnectGrace
      }
    });

    // Reincorporación a una sala previa (misma pestaña recargada o red caída).
    if (player.roomCode) this.restoreRoom(socket, player);

    this.bind(socket, player);
  }

  bind(socket, player) {
    socket.on(EV.ROOM_CREATE, (payload, ack) => this.guard(socket, () => this.onRoomCreate(socket, player, payload || {}, ack), ack));
    socket.on(EV.ROOM_JOIN, (payload, ack) => this.guard(socket, () => this.onRoomJoin(socket, player, payload || {}, ack), ack));
    socket.on(EV.ROOM_LIST, () => this.guard(socket, () => this.onRoomList(socket)));
    socket.on(EV.ROOM_LEAVE, (payload, ack) => this.guard(socket, () => this.onRoomLeave(socket, player, ack), ack));
    socket.on(EV.ROOM_READY, (payload) => this.guard(socket, () => this.onRoomReady(socket, player, payload || {})));
    socket.on(EV.ROOM_AI, (payload) => this.guard(socket, () => this.onRoomAI(socket, player, payload || {})));
    socket.on(EV.ROOM_START, (payload, ack) => this.guard(socket, () => this.onRoomStart(socket, player, ack), ack));
    socket.on(EV.INPUT, (payload) => this.guard(socket, () => this.onInput(socket, player, payload)));
    socket.on(EV.RACE_RESTART, (payload, ack) => this.guard(socket, () => this.onRestart(socket, player, ack), ack));
    socket.on(EV.CLOCK_SYNC, (payload) => this.guard(socket, () => this.onClockSync(socket, payload || {})));
    socket.on('disconnect', () => this.guard(socket, () => this.onDisconnect(socket, player)));
  }

  guard(socket, fn, ack) {
    try {
      fn();
    } catch (err) {
      const code = err && err.code ? err.code : 'INTERNAL';
      const message = err && err.message ? err.message : 'Error interno';
      this.sendError(socket, code, message);
      if (typeof ack === 'function') ack({ ok: false, code: code, message: message });
      if (code === 'INTERNAL') this.logger.error('[socket]', err);
    }
  }

  sendError(socket, code, message) {
    socket.emit(EV.ERROR, { code, message: message || code });
  }

  ack(ack, ok, extra) {
    if (typeof ack === 'function') ack(Object.assign({ ok: ok }, extra || {}));
  }

  /** Rate limiting por ventana deslizante de 1 segundo. */
  allow(socket, kind, limit) {
    const now = Date.now();
    const arr = socket.data.limits[kind];
    while (arr.length && now - arr[0] > 1000) arr.shift();
    if (arr.length >= limit) return false;
    arr.push(now);
    return true;
  }

  isHost(room, player) {
    if (!room) throw makeErr(ERR.NOT_IN_ROOM, 'No estás en una sala');
    if (room.hostId !== player.id) throw makeErr(ERR.NOT_HOST, 'Solo el anfitrión puede hacerlo');
  }

  applyName(player, rawName) {
    const name = validateName(rawName);
    if (!name) throw makeErr(ERR.BAD_NAME, 'Nombre inválido (2–16 caracteres)');
    player.name = name;
    return name;
  }

  you(player) {
    return { id: player.id, name: player.name, colorHex: player.colorHex, token: player.token };
  }

  onRoomCreate(socket, player, payload, ack) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    if (player.roomCode) throw makeErr(ERR.ROOM_STARTED, 'Ya estás en una sala');
    this.applyName(player, payload.name);

    const room = this.roomManager.create(player, {
      isPublic: payload.isPublic !== false,
      maxPlayers: payload.maxPlayers,
      fillAI: payload.aiCount > 0
    });
    if (payload.aiCount !== undefined) {
      try { this.roomManager.setAI(player.id, payload.aiCount); } catch (e) { /* ignorar */ }
    }
    socket.join(room.code);

    socket.emit(EV.ROOM_CREATED, { room: this.roomManager.serialize(room), you: this.you(player) });
    this.broadcastRoomUpdate(room);
    this.ack(ack, true, { code: room.code });
  }

  onRoomJoin(socket, player, payload, ack) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    const code = normalizeCode(payload.code);
    if (!code) throw makeErr(ERR.BAD_CODE, 'Código inválido');
    this.applyName(player, payload.name);

    const room = this.roomManager.join(player, code);
    socket.join(room.code);
    socket.emit(EV.ROOM_JOINED, { room: this.roomManager.serialize(room), you: this.you(player) });
    this.broadcastRoomUpdate(room);
    this.ack(ack, true, { code: room.code });
  }

  onRoomList(socket) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    socket.emit(EV.ROOM_LISTING, { rooms: this.roomManager.listPublic() });
  }

  onRoomLeave(socket, player, ack) {
    const room = this.roomManager.findRoomByPlayer(player.id);
    if (!room) { this.ack(ack, true, {}); return; }
    const hostChanged = room.hostId === player.id;
    this.raceManager.handleDisconnect(room, player.id);
    this.roomManager.leave(player.id);
    socket.leave(room.code);
    socket.emit(EV.ROOM_LEFT, { code: room.code });
    if (this.roomManager.rooms.has(room.code)) {
      this.broadcastRoomUpdate(room);
      if (hostChanged) this.broadcastRoom(room.code, EV.HOST_CHANGED, { hostId: room.hostId });
    }
    this.broadcastListing();
    this.ack(ack, true, {});
  }

  onRoomReady(socket, player, payload) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    const room = this.roomManager.setReady(player.id, payload.ready === true);
    this.broadcastRoomUpdate(room);
  }

  onRoomAI(socket, player, payload) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    const room = this.roomManager.findRoomByPlayer(player.id);
    this.isHost(room, player);
    this.roomManager.setAI(player.id, payload.count);
    this.broadcastRoomUpdate(room);
  }

  onRoomStart(socket, player, ack) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    const room = this.roomManager.findRoomByPlayer(player.id);
    this.isHost(room, player);
    const check = this.roomManager.canStart(room);
    if (!check.ok) {
      this.sendError(socket, check.reason, check.reason === ERR.NOT_READY
        ? 'Faltan jugadores por marcar listo'
        : 'Se necesitan al menos ' + room.minHumans + ' jugadores conectados');
      return this.ack(ack, false, { reason: check.reason });
    }
    this.raceManager.start(room);
    this.broadcastRoomUpdate(room);
    this.ack(ack, true, {});
  }

  onInput(socket, player, payload) {
    if (!this.allow(socket, 'input', this.config.network.maxInputsPerSecond)) {
      return; // descarta silenciosamente para no saturar
    }
    const input = sanitizeInput(payload);
    if (!input) {
      this.sendError(socket, ERR.INVALID_INPUT, 'Entrada inválida');
      return;
    }
    if (input.seq <= socket.data.lastSeq) return;
    socket.data.lastSeq = input.seq;

    const room = player.roomCode ? this.roomManager.rooms.get(player.roomCode) : null;
    if (!room) return;
    this.raceManager.handleInput(room, player.id, input);
  }

  onRestart(socket, player, ack) {
    if (!this.allow(socket, 'event', this.config.network.maxEventsPerSecond)) {
      return this.sendError(socket, ERR.RATE_LIMITED, 'Demasiadas peticiones');
    }
    const room = this.roomManager.findRoomByPlayer(player.id);
    this.isHost(room, player);
    // El anfitrión puede reiniciar en cualquier momento: se detiene el bucle
    // actual y se vuelve a montar la parrilla con los jugadores conectados.
    this.raceManager.restart(room);
    this.broadcastRoomUpdate(room);
    this.ack(ack, true, {});
  }

  onClockSync(socket, payload) {
    socket.emit(EV.CLOCK_PONG, {
      clientTime: Number(payload.clientTime) || 0,
      serverTime: Date.now()
    });
  }

  onDisconnect(socket, player) {
    if (socket.data && socket.data.replaced) return;
    if (player.socketId !== socket.id) return;

    this.playerManager.detach(player);
    const room = this.roomManager.markDisconnected(player.id);
    if (room) {
      this.raceManager.handleDisconnect(room, player.id);
      this.broadcastRoom(room.code, EV.PLAYER_DISCONNECTED, {
        playerId: player.id,
        name: player.name,
        grace: this.config.network.reconnectGrace
      });
      if (this.roomManager.rooms.has(room.code)) {
        this.broadcastRoomUpdate(room);
        this.broadcastRoom(room.code, EV.HOST_CHANGED, { hostId: room.hostId });
      }
    }
    this.broadcastListing();
  }

  restoreRoom(socket, player) {
    const room = this.roomManager.rooms.get(player.roomCode);
    if (!room) { player.roomCode = null; return; }
    this.playerManager.attach(player, socket.id);
    this.roomManager.markReconnected(player.id);
    socket.join(room.code);

    socket.emit(EV.ROOM_JOINED, {
      room: this.roomManager.serialize(room),
      you: this.you(player),
      reconnected: true
    });

    if (room.sim) {
      this.raceManager.handleReconnect(room, player.id);
      socket.emit(EV.RACE_START, {
        serverTime: Date.now(),
        countdown: room.sim.race.countdown,
        laps: this.config.race.laps,
        checkpoints: this.config.race.checkpoints,
        fixedDt: this.config.physics.fixedDt,
        karts: room.sim.fullState().karts,
        reconnected: true
      });
      if (room.state === 'results') {
        socket.emit(EV.RACE_FINISH, {
          results: room.sim.results(),
          raceTime: room.sim.race.time,
          serverTime: Date.now()
        });
      }
    }

    this.broadcastRoom(room.code, EV.PLAYER_RECONNECTED, { playerId: player.id, name: player.name });
    this.broadcastRoomUpdate(room);
  }

  cleanup() {
    const now = Date.now();
    const graceMs = this.config.network.reconnectGrace * 1000;
    let changed = false;

    for (const room of [...this.roomManager.rooms.values()]) {
      for (const p of [...room.players.values()]) {
        if (p.connected) continue;
        const player = this.playerManager.getById(p.id);
        const since = player ? player.disconnectedAt : now;
        if (since && now - since > graceMs) {
          if (room.sim) this.raceManager.handleDisconnect(room, p.id);
          this.roomManager.leave(p.id);
          changed = true;
          if (this.roomManager.rooms.has(room.code)) {
            this.broadcastRoom(room.code, EV.PLAYER_LEFT, { playerId: p.id, name: p.name });
            this.broadcastRoomUpdate(room);
            this.broadcastRoom(room.code, EV.HOST_CHANGED, { hostId: room.hostId });
          }
        }
      }
    }

    const removedRooms = this.roomManager.cleanup(now);
    if (removedRooms.length) changed = true;
    this.playerManager.purgeExpired(now);
    if (changed) this.broadcastListing();
  }

  broadcastRoom(code, ev, payload) {
    this.io.to(code).emit(ev, payload);
  }

  broadcastRoomUpdate(room) {
    if (!room || !this.roomManager.rooms.has(room.code)) return;
    this.broadcastRoom(room.code, EV.ROOM_UPDATE, { room: this.roomManager.serialize(room) });
    this.broadcastListing();
  }

  broadcastListing() {
    this.io.emit(EV.ROOM_LISTING, { rooms: this.roomManager.listPublic() });
  }
}

function makeErr(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}