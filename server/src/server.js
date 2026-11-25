import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';

import { CONFIG, clamp } from '../../shared/GameConfig.js';
import { PlayerManager } from './PlayerManager.js';
import { RoomManager } from './RoomManager.js';
import { RaceManager } from './RaceManager.js';
import { SocketManager } from './SocketManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

function applyEnvConfig() {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  if (process.env.RECONNECT_GRACE) cfg.network.reconnectGrace = clamp(Number(process.env.RECONNECT_GRACE) || 30, 5, 300);
  if (process.env.MAX_PLAYERS) cfg.network.maxPlayers = clamp(Number(process.env.MAX_PLAYERS) || 8, 2, 8);
  if (process.env.EMPTY_ROOM_TTL) cfg.network.emptyRoomTtl = clamp(Number(process.env.EMPTY_ROOM_TTL) || 60, 10, 3600);
  return cfg;
}

/**
 * Crea una instancia completa (sin escuchar). Útil para pruebas de
 * integración: permite levantar el servidor en un puerto efímero.
 */
export function createKartCampusServer(options = {}) {
  const config = options.config || applyEnvConfig();
  const app = express();
  const server = http.createServer(app);

  const allowedOrigins = String(process.env.ALLOWED_ORIGIN || 'http://localhost:' + (process.env.PORT || 3000))
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    maxHttpBufferSize: 64 * 1024,
    pingTimeout: 20000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
  });

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const clientDir = path.join(ROOT, 'client');
  const staticOpts = {
    extensions: ['html'],
    etag: true,
    maxAge: options.maxAge !== undefined ? options.maxAge : 0,
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
  };

  app.use('/shared', express.static(path.join(ROOT, 'shared'), staticOpts));
  app.use('/vendor', express.static(path.join(ROOT, 'vendor'), staticOpts));
  app.use(express.static(clientDir, staticOpts));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      name: 'kart-campus',
      version: '2.0.0',
      uptime: process.uptime(),
      rooms: roomManager.rooms.size,
      players: playerManager.byId.size,
      now: Date.now()
    });
  });

  // Fallback para la SPA (solo rutas GET que no sean ficheros).
  app.get(/^\/(?!socket\.io|shared|vendor).*/, (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  const playerManager = new PlayerManager(config);
  const roomManager = new RoomManager({
    config,
    playerManager,
    minHumans: options.minHumans !== undefined ? options.minHumans : (Number(process.env.MIN_HUMANS) || 2)
  });
  const raceManager = new RaceManager({
    roomManager,
    broadcastRoom(code, ev, payload) { io.to(code).emit(ev, payload); },
    config,
    logger: options.logger || console
  });
  const socketManager = new SocketManager({
    io,
    playerManager,
    roomManager,
    raceManager,
    config,
    logger: options.logger || console
  });
  socketManager.attach();

  return { app, server, io, config, playerManager, roomManager, raceManager, socketManager, allowedOrigins };
}

/** Arranca el servidor si este módulo es el punto de entrada. */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const instance = createKartCampusServer();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';

  instance.server.listen(port, host, () => {
    const shownHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log('=====================================================');
    console.log('  KART CAMPUS — servidor autoritativo');
    console.log('  Local:   http://' + shownHost + ':' + port);
    console.log('  Salud:   http://' + shownHost + ':' + port + '/health');
    console.log('  CORS:    ' + instance.allowedOrigins.join(', '));
    console.log('=====================================================');
    console.log('  Abre el cliente en el navegador. Para jugar desde un');
    console.log('  móvil en la misma red, usa http://IP_LOCAL:' + port);
  });

  const shutdown = function () {
    console.log('\nCerrando KART CAMPUS…');
    instance.io.close();
    instance.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export { applyEnvConfig };