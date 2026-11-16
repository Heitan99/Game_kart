/* =====================================================================
   KART CAMPUS — protocolo de red y validación
   Nombres de eventos, saneado de datos y codificación compacta de
   snapshots. Compartido por cliente y servidor.
   ===================================================================== */
import { clamp } from './GameConfig.js';

export const EV = Object.freeze({
  // cliente → servidor
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LIST: 'room:list',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_START: 'room:start',
  ROOM_AI: 'room:ai',
  INPUT: 'input',
  RACE_RESTART: 'race:restart',
  CLOCK_SYNC: 'clock:sync',

  // servidor → cliente
  WELCOME: 'welcome',
  ERROR: 'kc:error',
  ROOM_LISTING: 'room:listing',
  ROOM_CREATED: 'room:created',
  ROOM_JOINED: 'room:joined',
  ROOM_UPDATE: 'room:update',
  ROOM_LEFT: 'room:left',
  RACE_COUNTDOWN: 'race:countdown',
  RACE_START: 'race:start',
  SNAPSHOT: 'state',
  RACE_FINISH: 'race:finish',
  RACE_RESTARTED: 'race:restarted',
  PLAYER_LEFT: 'player:left',
  PLAYER_DISCONNECTED: 'player:disconnected',
  PLAYER_RECONNECTED: 'player:reconnected',
  HOST_CHANGED: 'host:changed',
  CLOCK_PONG: 'clock:pong'
});

export const ERR = Object.freeze({
  BAD_NAME: 'BAD_NAME',
  BAD_CODE: 'BAD_CODE',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_STARTED: 'ROOM_STARTED',
  NOT_HOST: 'NOT_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  NOT_READY: 'NOT_READY',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_IN_ROOM: 'NOT_IN_ROOM'
});

/** Sanea un nombre visible. Mantiene letras Unicode, números, espacio y guiones. */
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>"'`\\/]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return cleaned.slice(0, 16);
}

/** Valida y normaliza un nombre; devuelve null si no es aceptable. */
export function validateName(raw) {
  const name = sanitizeName(raw);
  if (name.length < 2) return null;
  if (!/\p{L}|\p{N}/u.test(name)) return null;
  return name;
}

/** Normaliza un código de sala (4–6 caracteres A-Z0-9). */
export function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4 || code.length > 6) return null;
  return code;
}

/** Valida una entrada de conducción y la acota a rangos seguros. */
export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seq = Number(raw.seq);
  const throttle = Number(raw.throttle);
  const brake = Number(raw.brake);
  const steer = Number(raw.steer);
  if (!Number.isFinite(seq) || seq < 0 || seq > 1e12) return null;
  if (!Number.isFinite(throttle) || !Number.isFinite(brake) || !Number.isFinite(steer)) return null;
  return {
    seq: Math.floor(seq),
    throttle: clamp(throttle, 0, 1),
    brake: clamp(brake, 0, 1),
    steer: clamp(steer, -1, 1),
    turbo: raw.turbo === true
  };
}

/** Verifica que un objeto solo contenga claves permitidas. */
export function hasOnlyKeys(obj, allowed) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Snapshots compactos                                                */
/* ------------------------------------------------------------------ */
export function encodeKart(k) {
  return {
    i: k.id,
    n: k.name,
    c: k.colorHex,
    x: round2(k.x),
    z: round2(k.z),
    h: round3(k.heading),
    v: round2(k.speed),
    g: k.nextGate,
    l: k.laps,
    f: k.finished ? 1 : 0,
    p: k.finishPlace,
    ft: round2(k.finishTime),
    pos: k.position,
    cp: k.cpValidated,
    o: k.offRoad ? 1 : 0,
    ts: k.turboState,
    tt: round2(k.turboTimer),
    s: round2(k.steerVisual),
    w: round2(k.wheelSpin)
  };
}

export function decodeKart(e) {
  return {
    id: e.i, name: e.n, colorHex: e.c, x: e.x, z: e.z, heading: e.h,
    speed: e.v, nextGate: e.g, laps: e.l, finished: !!e.f,
    finishPlace: e.p, finishTime: e.ft, position: e.pos,
    cpValidated: e.cp, offRoad: !!e.o, turboState: e.ts,
    turboTimer: e.tt, steerVisual: e.s, wheelSpin: e.w
  };
}

export function encodeSnapshot(race, karts) {
  return {
    t: round3(race.time),
    st: race.state,
    cd: round2(race.countdown || 0),
    k: karts.map(encodeKart)
  };
}

export function decodeSnapshot(msg) {
  return {
    time: msg.t,
    state: msg.st,
    countdown: msg.cd,
    karts: (msg.k || []).map(decodeKart)
  };
}

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function round3(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }