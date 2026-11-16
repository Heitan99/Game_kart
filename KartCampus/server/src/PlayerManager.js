/* =====================================================================
   KART CAMPUS — identidad y reconexión de jugadores
   Cada conexión recibe un id y un token secreto. El token permite
   recuperar la misma plaza tras una desconexión temporal, evitando
   duplicar vehículos o participantes.
   ===================================================================== */
import crypto from 'node:crypto';
import { CONFIG, KART_COLORS } from '../../shared/GameConfig.js';

export class PlayerManager {
  constructor(config = CONFIG) {
    this.config = config;
    this.byId = new Map();
    this.byToken = new Map();
    this.colorCursor = 0;
  }

  create(name) {
    const id = 'p_' + crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    const colorIndex = this.colorCursor++ % KART_COLORS.length;
    const player = {
      id,
      token,
      name,
      colorIndex,
      colorHex: KART_COLORS[colorIndex],
      socketId: null,
      connected: false,
      roomCode: null,
      disconnectedAt: 0,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };
    this.byId.set(id, player);
    this.byToken.set(token, player);
    return player;
  }

  getByToken(token) {
    if (typeof token !== 'string' || token.length < 16) return null;
    return this.byToken.get(token) || null;
  }

  getById(id) {
    return this.byId.get(id) || null;
  }

  attach(player, socketId) {
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = 0;
    player.lastSeen = Date.now();
    return player;
  }

  detach(player) {
    if (!player) return null;
    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();
    player.lastSeen = Date.now();
    return player;
  }

  /** Elimina jugadores desconectados que ya superaron la ventana de gracia. */
  purgeExpired(now = Date.now(), keepIds) {
    const graceMs = this.config.network.reconnectGrace * 1000;
    const removed = [];
    for (const [id, p] of this.byId) {
      if (p.connected) continue;
      if (keepIds && keepIds.has(id)) continue;
      if (now - p.disconnectedAt > graceMs) {
        this.byId.delete(id);
        this.byToken.delete(p.token);
        removed.push(p);
      }
    }
    return removed;
  }

  /** Asigna un color libre dentro de una sala. */
  pickColor(usedHexes) {
    for (let i = 0; i < KART_COLORS.length; i++) {
      const hex = KART_COLORS[(this.colorCursor + i) % KART_COLORS.length];
      if (!usedHexes.has(hex)) {
        this.colorCursor = (this.colorCursor + i + 1) % KART_COLORS.length;
        return hex;
      }
    }
    return KART_COLORS[this.colorCursor++ % KART_COLORS.length];
  }
}