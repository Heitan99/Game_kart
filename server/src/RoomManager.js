import { CONFIG } from '../../shared/GameConfig.js';
import { ERR } from '../../shared/Protocol.js';

// Alfabeto sin caracteres ambiguos (O/0, I/1, L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

export class RoomManager {
  constructor({ config = CONFIG, playerManager, minHumans = 2 } = {}) {
    this.config = config;
    this.playerManager = playerManager;
    this.minHumans = Math.max(1, minHumans);
    this.rooms = new Map();
    this.codeLength = 5;
  }

  generateCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < this.codeLength; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  create(host, opts = {}) {
    if (host.roomCode) {
      throw fail(ERR.ROOM_STARTED, 'Ya estás en una sala');
    }
    const isPublic = opts.isPublic !== false;
    const maxPlayers = clampInt(opts.maxPlayers, 2, this.config.network.maxPlayers, this.config.network.maxPlayers);
    const room = {
      code: this.generateCode(),
      isPublic,
      hostId: host.id,
      maxPlayers,
      fillAI: opts.fillAI === true,
      minHumans: this.minHumans,
      players: new Map(),
      state: 'lobby',
      sim: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      emptySince: null,
      aiCount: 0
    };
    this.rooms.set(room.code, room);
    this.join(host, room.code);
    return room;
  }

  join(player, rawCode) {
    const code = String(rawCode || '').toUpperCase().trim();
    const room = this.rooms.get(code);
    if (!room) throw fail(ERR.ROOM_NOT_FOUND, 'La sala no existe');
    if (player.roomCode && player.roomCode !== code) {
      throw fail(ERR.ROOM_STARTED, 'Ya estás en otra sala');
    }
    if (room.players.has(player.id)) {
      // Reincorporación idempotente.
      return room;
    }
    if (room.state !== 'lobby') throw fail(ERR.ROOM_STARTED, 'La carrera ya comenzó');
    if (room.players.size >= room.maxPlayers) throw fail(ERR.ROOM_FULL, 'La sala está completa');

    const used = new Set();
    for (const p of room.players.values()) used.add(p.colorHex);
    if (!used.has(player.colorHex)) {
      // conserva su color si está libre
    } else {
      player.colorHex = this.playerManager.pickColor(used);
    }

    room.players.set(player.id, {
      id: player.id,
      name: player.name,
      colorHex: player.colorHex,
      ready: false,
      connected: !!player.connected,
      isHost: room.hostId === player.id
    });
    player.roomCode = code;
    room.emptySince = null;
    room.lastActivity = Date.now();
    return room;
  }

  leave(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) return { room: null, closed: false };
    room.players.delete(playerId);
    const player = this.playerManager.getById(playerId);
    if (player) player.roomCode = null;
    room.lastActivity = Date.now();

    // Transferencia de host al siguiente humano conectado (o al primero).
    if (room.hostId === playerId) {
      const next = [...room.players.values()].find(function (p) { return p.connected; }) ||
        [...room.players.values()][0];
      if (next) {
        room.hostId = next.id;
        for (const p of room.players.values()) p.isHost = (p.id === room.hostId);
      } else {
        room.hostId = null;
      }
    }

    const humans = [...room.players.values()].filter(function (p) { return p.connected; });
    if (humans.length === 0 && !room.emptySince) room.emptySince = Date.now();

    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return { room: null, closed: true, code: room.code };
    }
    return { room, closed: false, hostChanged: true };
  }

  setReady(playerId, ready) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) throw fail(ERR.NOT_IN_ROOM, 'No estás en una sala');
    const p = room.players.get(playerId);
    if (!p) throw fail(ERR.NOT_IN_ROOM, 'No estás en una sala');
    p.ready = !!ready;
    room.lastActivity = Date.now();
    return room;
  }

  setAI(playerId, count) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) throw fail(ERR.NOT_IN_ROOM, 'No estás en una sala');
    if (room.hostId !== playerId) throw fail(ERR.NOT_HOST, 'Solo el anfitrión puede cambiarlo');
    room.aiCount = clampInt(count, 0, this.config.network.maxPlayers, 0);
    room.fillAI = room.aiCount > 0;
    room.lastActivity = Date.now();
    return room;
  }

  markDisconnected(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) return null;
    const p = room.players.get(playerId);
    if (p) p.connected = false;
    const humans = [...room.players.values()].filter(function (q) { return q.connected; });
    if (humans.length === 0 && !room.emptySince) room.emptySince = Date.now();
    // Si se va el host, transfiere el control inmediatamente.
    if (room.hostId === playerId) {
      const next = humans[0] || [...room.players.values()][0];
      if (next) {
        room.hostId = next.id;
        for (const q of room.players.values()) q.isHost = (q.id === room.hostId);
      }
    }
    room.lastActivity = Date.now();
    return room;
  }

  markReconnected(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) return null;
    const p = room.players.get(playerId);
    if (p) p.connected = true;
    if (room.hostId === playerId) {
      for (const q of room.players.values()) q.isHost = (q.id === room.hostId);
    }
    room.emptySince = null;
    room.lastActivity = Date.now();
    return room;
  }

  canStart(room) {
    const connected = [...room.players.values()].filter(function (p) { return p.connected; });
    const humans = connected.length;
    if (humans < room.minHumans) {
      return { ok: false, reason: ERR.NOT_ENOUGH_PLAYERS, need: room.minHumans, humans };
    }
    const notReady = connected.filter(function (p) { return p.id !== room.hostId && !p.ready; });
    if (notReady.length > 0) {
      return { ok: false, reason: ERR.NOT_READY, waiting: notReady.map(function (p) { return p.name; }) };
    }
    return { ok: true, humans };
  }

  /** Devuelve los humanos conectados que participarán en la carrera. */
  racers(room) {
    return [...room.players.values()].filter(function (p) { return p.connected; });
  }

  findRoomByPlayer(playerId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(playerId)) return room;
    }
    return null;
  }

  listPublic() {
    const out = [];
    for (const room of this.rooms.values()) {
      if (!room.isPublic || room.state !== 'lobby') continue;
      out.push(this.serialize(room));
    }
    out.sort(function (a, b) { return b.players.length - a.players.length; });
    return out;
  }

  serialize(room) {
    return {
      code: room.code,
      isPublic: room.isPublic,
      hostId: room.hostId,
      state: room.state,
      maxPlayers: room.maxPlayers,
      minHumans: room.minHumans,
      aiCount: room.aiCount,
      fillAI: room.fillAI,
      players: [...room.players.values()].map(function (p) {
        return {
          id: p.id, name: p.name, colorHex: p.colorHex,
          ready: p.ready, connected: p.connected, isHost: p.id === room.hostId
        };
      })
    };
  }

  /** Elimina salas vacías y demasiado antiguas. */
  cleanup(now = Date.now()) {
    const emptyTtl = this.config.network.emptyRoomTtl * 1000;
    const maxTtl = this.config.network.roomTtl * 1000;
    const removed = [];
    for (const [code, room] of this.rooms) {
      const connectedHumans = [...room.players.values()].filter(function (p) { return p.connected; });
      if (connectedHumans.length === 0) {
        if (!room.emptySince) room.emptySince = now;
        if (now - room.emptySince > emptyTtl) {
          this.rooms.delete(code);
          removed.push(code);
          continue;
        }
      } else {
        room.emptySince = null;
      }
      if (now - room.createdAt > maxTtl) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}