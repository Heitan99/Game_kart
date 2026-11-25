import { EV } from '../../../shared/Protocol.js';
import { NetworkManager } from './NetworkManager.js';

export class ClientRoomManager {
  constructor(network) {
    this.network = network || new NetworkManager();
    this.room = null;
    this.rooms = [];
    this.playerId = null;
    this.colorHex = 0x2fe3ff;
    this.name = 'PILOTO';
    this.onRoom = null;
    this.onRooms = null;
    this.onError = null;
    this.onLeft = null;
    this.bind();
  }

  bind() {
    const n = this.network;
    n.on(EV.WELCOME, (d) => { this.playerId = d.playerId; this.colorHex = d.colorHex; });
    n.on(EV.ROOM_LISTING, (d) => {
      this.rooms = (d && d.rooms) || [];
      if (this.onRooms) this.onRooms(this.rooms);
    });
    n.on(EV.ROOM_CREATED, (d) => this._setRoom(d));
    n.on(EV.ROOM_JOINED, (d) => this._setRoom(d));
    n.on(EV.ROOM_UPDATE, (d) => { if (d && d.room) this._setRoom({ room: d.room }); });
    n.on(EV.ROOM_LEFT, () => { this.room = null; if (this.onLeft) this.onLeft(); });
    n.on(EV.ERROR, (d) => { if (this.onError) this.onError(d); });
  }

  _setRoom(d) {
    if (!d || !d.room) return;
    this.room = d.room;
    if (d.you) {
      this.playerId = d.you.id;
      this.colorHex = d.you.colorHex;
      this.name = d.you.name;
    }
    if (this.onRoom) this.onRoom(this.room);
  }

  connect() {
    return this.network.connect();
  }

  requestList() {
    if (this.network.connected) this.network.emit(EV.ROOM_LIST, {});
  }

  create(opts) {
    this.name = opts.name;
    return this.network.emit(EV.ROOM_CREATE, {
      name: opts.name,
      isPublic: opts.isPublic !== false,
      maxPlayers: opts.maxPlayers || 8,
      aiCount: opts.aiCount || 0
    });
  }

  join(code, name) {
    this.name = name;
    return this.network.emit(EV.ROOM_JOIN, { code: code, name: name });
  }

  leave() {
    return this.network.emit(EV.ROOM_LEAVE, {});
  }

  setReady(ready) {
    return this.network.emit(EV.ROOM_READY, { ready: !!ready });
  }

  setAI(count) {
    return this.network.emit(EV.ROOM_AI, { count: count });
  }

  start() {
    return this.network.emit(EV.ROOM_START, {});
  }

  restart() {
    return this.network.emit(EV.RACE_RESTART, {});
  }

  isHost() {
    return this.room && this.room.hostId === this.playerId;
  }

  me() {
    if (!this.room) return null;
    return this.room.players.find((p) => p.id === this.playerId) || null;
  }

  get code() {
    return this.room ? this.room.code : null;
  }
}