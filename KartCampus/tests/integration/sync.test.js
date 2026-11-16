/* =====================================================================
   Pruebas de integración — sincronización, turbo, reconexión y seguridad
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EV, ERR, decodeSnapshot } from '../../shared/Protocol.js';
import {
  startServer, connectClient, emitAck, waitFor, waitUntil, closeSocket
} from '../helpers/server.js';

let ctx;
test.before(async () => { ctx = await startServer(); });
test.after(async () => { await ctx.close(); });

/** Prepara una sala con dos humanos listos y espera al inicio. */
async function twoPlayers() {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Host', isPublic: false }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);
  const b = await connectClient(ctx.url);
  b.socket.emit(EV.ROOM_JOIN, { code: created.room.code, name: 'Retador' }, () => {});
  await waitFor(b.socket, EV.ROOM_JOINED);
  b.socket.emit(EV.ROOM_READY, { ready: true });
  await waitUntil(() => true, 200);

  const start = waitFor(b.socket, EV.RACE_START);
  await emitAck(a.socket, EV.ROOM_START, {});
  const data = await start;

  let last = null;
  b.socket.on(EV.SNAPSHOT, (s) => { last = decodeSnapshot(s); });
  return { a, b, data, snapshot: () => last };
}

function kartOf(snap, id) {
  return snap && snap.karts ? snap.karts.find((k) => k.id === id) : null;
}

test('el movimiento del jugador se sincroniza con el otro cliente', async () => {
  const { a, b, data, snapshot } = await twoPlayers();
  const id = a.welcome.playerId;
  const initial = data.karts.find((k) => k.id === id);

  let seq = 0;
  const timer = setInterval(() => {
    a.socket.emit(EV.INPUT, { seq: ++seq, throttle: 1, brake: 0, steer: 0, turbo: false });
  }, 16);

  await waitUntil(() => {
    const s = kartOf(snapshot(), id);
    if (!s || s.speed <= 1) return false;
    return Math.hypot(s.x - initial.x, s.z - initial.z) > 1.5;
  }, 6000);

  clearInterval(timer);
  const s = kartOf(snapshot(), id);
  assert.ok(s, 'el snapshot de B incluye a A');
  assert.ok(s.speed > 1, 'A se mueve según el servidor');
  const moved = Math.hypot(s.x - initial.x, s.z - initial.z);
  assert.ok(moved > 1, 'la posición de A cambió y B la recibe');

  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('el turbo se sincroniza entre clientes', async () => {
  const { a, b, snapshot } = await twoPlayers();
  const id = a.welcome.playerId;

  let seq = 0;
  const timer = setInterval(() => {
    a.socket.emit(EV.INPUT, { seq: ++seq, throttle: 1, brake: 0, steer: 0, turbo: false });
  }, 16);
  await waitUntil(() => {
    const s = kartOf(snapshot(), id);
    return s && s.speed > 5;
  }, 6000);

  a.socket.emit(EV.INPUT, { seq: ++seq, throttle: 1, brake: 0, steer: 0, turbo: true });
  const sawTurbo = await waitUntil(() => {
    const s = kartOf(snapshot(), id);
    return s && s.turboState === 'active';
  }, 4000).catch(() => false);

  clearInterval(timer);
  assert.equal(sawTurbo, true, 'B observa a A en estado de turbo');
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('una entrada malformada se rechaza con INVALID_INPUT', async () => {
  const { a, b } = await twoPlayers();
  const errPromise = waitFor(a.socket, EV.ERROR);
  a.socket.emit(EV.INPUT, { seq: 'no-es-un-numero', throttle: 1 });
  const err = await errPromise;
  assert.equal(err.code, ERR.INVALID_INPUT);
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('el rate limiting frena peticiones abusivas de eventos', async () => {
  // `room:list` consume el presupuesto de eventos por segundo (30). Una
  // ráfaga muy superior debe provocar un aviso RATE_LIMITED.
  const { socket } = await connectClient(ctx.url);
  const limitedP = waitFor(socket, EV.ERROR, 3000).catch(() => null);
  for (let i = 0; i < 400; i++) socket.emit(EV.ROOM_LIST, {});
  const limited = await limitedP;
  assert.ok(limited, 'debe producirse un aviso de límite');
  assert.equal(limited.code, ERR.RATE_LIMITED);
  closeSocket(socket);
});

test('las entradas abusivas se descartan sin romper la simulación', async () => {
  const { a, b, data, snapshot } = await twoPlayers();
  const id = a.welcome.playerId;
  const initial = data.karts.find((k) => k.id === id);
  // Espera a que termine la cuenta atrás: las entradas solo cuentan en carrera.
  await waitUntil(() => snapshot() && snapshot().state === 'racing', 4000);
  // Ráfaga muy superior al límite de entradas. El servidor las descarta en
  // silencio, pero las primeras válidas deben seguir aplicándose.
  for (let i = 0; i < 400; i++) {
    a.socket.emit(EV.INPUT, { seq: i + 1, throttle: 1, brake: 0, steer: 0, turbo: false });
  }
  const moved = await waitUntil(() => {
    const s = kartOf(snapshot(), id);
    return s && s.speed > 1 && Math.hypot(s.x - initial.x, s.z - initial.z) > 1;
  }, 6000).catch(() => false);
  const s = kartOf(snapshot(), id);
  assert.equal(moved, true, 'aun con abuso, la simulación avanza con normalidad');
  assert.ok(s && typeof s.x === 'number' && typeof s.z === 'number', 'snapshots válidos');
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('eventos desconocidos no provocan fin de carrera ni afectan al servidor', async () => {
  const { a, b } = await twoPlayers();
  let finished = false;
  b.socket.on(EV.RACE_FINISH, () => { finished = true; });
  a.socket.emit('hack:win', { position: 1 });
  a.socket.emit(EV.RACE_FINISH, { results: [{ position: 1 }] });
  await waitUntil(() => true, 400);
  assert.equal(finished, false, 'el cliente no puede declarar resultados');
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('la reconexión recupera la misma identidad y sala', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Reconector', isPublic: false }, () => {});
  await waitFor(a.socket, EV.ROOM_CREATED);
  const token = a.welcome.token;
  const playerId = a.welcome.playerId;
  closeSocket(a.socket);

  await waitUntil(() => true, 400);
  const again = await connectClient(ctx.url, token);
  assert.equal(again.welcome.reconnected, true, 'el servidor reconoce el token');
  assert.equal(again.welcome.playerId, playerId, 'mantiene el mismo id');
  closeSocket(again.socket);
});

test('los karts arrancan en posiciones de parrilla distintas', async () => {
  const { a, b, data } = await twoPlayers();
  const pa = data.karts.find((k) => k.id === a.welcome.playerId);
  const pb = data.karts.find((k) => k.id === b.welcome.playerId);
  assert.ok(pa && pb);
  const dist = Math.hypot(pa.x - pb.x, pa.z - pb.z);
  assert.ok(dist > 2, 'cada kart ocupa un slot distinto');
  closeSocket(a.socket);
  closeSocket(b.socket);
});