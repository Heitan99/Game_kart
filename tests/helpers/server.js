import { io } from 'socket.io-client';
import { CONFIG } from '../../shared/GameConfig.js';
import { createKartCampusServer } from '../../server/src/server.js';

/** Clona la configuración y la acelera para las pruebas. */
export function fastConfig(overrides = {}) {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.race.countdown = 0.15;
  cfg.network.snapshotRate = 30;
  cfg.network.inputRate = 60;
  Object.assign(cfg.race, overrides.race || {});
  Object.assign(cfg.network, overrides.network || {});
  return cfg;
}

/** Arranca una instancia en 127.0.0.1 con puerto aleatorio. */
export async function startServer(options = {}) {
  const config = options.config || fastConfig(options);
  const instance = createKartCampusServer({
    config: config,
    minHumans: options.minHumans !== undefined ? options.minHumans : 2,
    logger: { log() {}, error() {}, warn() {} },
    maxAge: 0
  });
  await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
  const port = instance.server.address().port;
  const url = 'http://127.0.0.1:' + port;

  return {
    instance,
    url,
    port,
    async close() {
      for (const room of instance.roomManager.rooms.values()) {
        instance.raceManager.stop(room);
      }
      instance.io.close();
      const closed = new Promise((resolve) => instance.server.close(resolve));
      if (typeof instance.server.closeAllConnections === 'function') {
        instance.server.closeAllConnections();
      }
      await closed;
    }
  };
}

/** Conecta un cliente y espera el evento `welcome`. */
export function connectClient(url, token) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      auth: token ? { token: token } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true
    });
    const timer = setTimeout(() => reject(new Error('timeout conectando ' + url)), 5000);
    socket.on('welcome', (data) => {
      clearTimeout(timer);
      resolve({ socket, welcome: data });
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Emite con ack y devuelve la respuesta como promesa (con timeout). */
export function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, timeout: true });
    }, 5000);
    socket.emit(event, payload, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res);
    });
  });
}

/** Espera un evento concreto (una sola vez) con timeout. */
export function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando ' + event)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Espera hasta que se cumpla una condición evaluada por sondeo. */
export function waitUntil(fn, timeout = 5000, interval = 40) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = fn(); } catch (e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - start > timeout) return reject(new Error('waitUntil: tiempo agotado'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

/** Cierra un socket con seguridad. */
export function closeSocket(socket) {
  if (!socket) return;
  try { socket.removeAllListeners(); socket.disconnect(); } catch (e) { /* ignorar */ }
}
