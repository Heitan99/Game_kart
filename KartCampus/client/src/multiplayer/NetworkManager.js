/* =====================================================================
   KART CAMPUS — gestor de red
   Envuelve Socket.IO con reconexión automática, token persistente y
   bus de eventos interno.
   ===================================================================== */
import { EV } from '/shared/Protocol.js';

const SERVER_EVENTS = [
  EV.WELCOME, EV.ERROR, EV.ROOM_LISTING, EV.ROOM_CREATED, EV.ROOM_JOINED,
  EV.ROOM_UPDATE, EV.ROOM_LEFT, EV.RACE_COUNTDOWN, EV.RACE_START,
  EV.SNAPSHOT, EV.RACE_FINISH, EV.RACE_RESTARTED, EV.PLAYER_LEFT,
  EV.PLAYER_DISCONNECTED, EV.PLAYER_RECONNECTED, EV.HOST_CHANGED, EV.CLOCK_PONG
];

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.token = safeRead('kc_token');
    this.playerId = null;
    this.connected = false;
    this.latency = 0;
    this.serverOffset = 0;
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const set = this.listeners.get(event);
    if (set) set.delete(fn);
  }

  _emit(event, data) {
    const set = this.listeners.get(event);
    if (set) for (const fn of [...set]) fn(data);
  }

  connect(url) {
    if (this.socket) return this.socket;
    if (typeof window === 'undefined' || typeof window.io === 'undefined') {
      throw new Error('Socket.IO no está disponible. ¿Se sirve el cliente desde el servidor?');
    }
    const target = url || window.location.origin;
    this.socket = window.io(target, {
      auth: this.token ? { token: this.token } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._emit('connect');
    });
    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this._emit('disconnect', reason);
    });
    this.socket.on('connect_error', (err) => {
      this._emit('connect_error', err);
    });

    for (const ev of SERVER_EVENTS) {
      this.socket.on(ev, (data) => {
        if (ev === EV.WELCOME && data) {
          this.token = data.token;
          this.playerId = data.playerId;
          safeWrite('kc_token', data.token);
          if (data.serverTime) this.serverOffset = data.serverTime - Date.now();
        }
        if (ev === EV.CLOCK_PONG && data) {
          const now = Date.now();
          this.latency = Math.max(0, now - data.clientTime);
          this.serverOffset = data.serverTime - (data.clientTime + this.latency / 2);
        }
        this._emit(ev, data);
      });
    }
    return this.socket;
  }

  emit(event, payload, ack) {
    if (!this.socket || !this.socket.connected) return false;
    this.socket.emit(event, payload, ack);
    return true;
  }

  /** Sincroniza el reloj y devuelve la latencia medida (ms). */
  syncClock() {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) { resolve(-1); return; }
      const sent = Date.now();
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(-1); } }, 3000);
      this.socket.emit(EV.CLOCK_SYNC, { clientTime: sent }, () => {});
      const off = this.on(EV.CLOCK_PONG, (data) => {
        if (done) return;
        done = true;
        off();
        clearTimeout(timer);
        this.latency = Math.max(0, Date.now() - sent);
        this.serverOffset = data.serverTime - (sent + this.latency / 2);
        resolve(this.latency);
      });
    });
  }

  /** Estima el tiempo de carrera del servidor en ms. */
  estimateServerNow() {
    return Date.now() + this.serverOffset;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
}

function safeRead(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function safeWrite(key, val) {
  try { window.localStorage.setItem(key, val); } catch (e) { /* modo privado */ }
}