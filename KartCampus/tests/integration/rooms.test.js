/* =====================================================================
   Pruebas de integración — salas, lobby y arranque sincronizado
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EV, ERR } from '../../shared/Protocol.js';
import {
  startServer, connectClient, emitAck, waitFor, waitUntil, closeSocket
} from '../helpers/server.js';

let ctx;
test.before(async () => { ctx = await startServer(); });
test.after(async () => { await ctx.close(); });

test('crear una sala genera un código único y el creador es anfitrión', async () => {
  const { socket } = await connectClient(ctx.url);
  const createdP = waitFor(socket, EV.ROOM_CREATED);
  const ack = await emitAck(socket, EV.ROOM_CREATE, { name: 'Anfitrion', isPublic: true, maxPlayers: 8 });
  const created = await createdP;
  assert.equal(ack.ok, true);
  assert.ok(created.room.code && created.room.code.length === 5);
  assert.equal(created.room.hostId, created.you.id);
  closeSocket(socket);
});

test('unirse por código funciona y comparte la lista de jugadores', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Host', isPublic: false }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);

  const b = await connectClient(ctx.url);
  const joined = waitFor(b.socket, EV.ROOM_JOINED);
  const ack = await emitAck(b.socket, EV.ROOM_JOIN, { code: created.room.code, name: 'Invitado' });
  assert.equal(ack.ok, true);
  const room = (await joined).room;
  assert.equal(room.players.length, 2);
  const update = await waitUntil(() => room.players.some((p) => p.name === 'Invitado'));
  assert.equal(update, true);
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('un código incorrecto se rechaza', async () => {
  const { socket } = await connectClient(ctx.url);
  const errPromise = waitFor(socket, EV.ERROR);
  const ack = await emitAck(socket, EV.ROOM_JOIN, { code: 'ZZZZZ', name: 'Nadie' });
  const err = await errPromise;
  assert.equal(err.code, ERR.ROOM_NOT_FOUND);
  assert.equal(ack.ok, false);
  closeSocket(socket);
});

test('las salas públicas aparecen en el listado', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Público', isPublic: true }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);

  const b = await connectClient(ctx.url);
  b.socket.emit(EV.ROOM_LIST, {});
  const listing = await waitFor(b.socket, EV.ROOM_LISTING);
  const found = listing.rooms.some((r) => r.code === created.room.code);
  assert.equal(found, true, 'la sala pública debe listarse');
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('no se puede iniciar con menos jugadores de los mínimos', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Solo', isPublic: false }, () => {});
  await waitFor(a.socket, EV.ROOM_CREATED);

  const errPromise = waitFor(a.socket, EV.ERROR);
  const ack = await emitAck(a.socket, EV.ROOM_START, {});
  const err = await errPromise;
  assert.equal(ack.ok, false);
  assert.equal(err.code, ERR.NOT_ENOUGH_PLAYERS);
  closeSocket(a.socket);
});

test('el anfitrión inicia cuando todos están listos y el inicio es sincronizado', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Host', isPublic: false }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);

  const b = await connectClient(ctx.url);
  b.socket.emit(EV.ROOM_JOIN, { code: created.room.code, name: 'Retador' }, () => {});
  await waitFor(b.socket, EV.ROOM_JOINED);

  b.socket.emit(EV.ROOM_READY, { ready: true });
  await waitUntil(() => true, 200);

  const startA = waitFor(a.socket, EV.RACE_START);
  const startB = waitFor(b.socket, EV.RACE_START);
  const ack = await emitAck(a.socket, EV.ROOM_START, {});
  assert.equal(ack.ok, true);

  const [sa, sb] = await Promise.all([startA, startB]);
  assert.ok(sa.countdown > 0 && sb.countdown > 0);
  assert.equal(sa.laps, 3);
  assert.equal(sa.karts.length, 2, 'dos humanos en parrilla');
  // Ambos reciben el mismo instante de referencia (serverTime cercano).
  assert.ok(Math.abs(sa.serverTime - sb.serverTime) < 250);
  const ids = sa.karts.map((k) => k.id).sort();
  assert.deepEqual(ids, sb.karts.map((k) => k.id).sort());

  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('el anfitrión puede reiniciar y todos reciben un nuevo inicio', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Host', isPublic: false }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);
  const b = await connectClient(ctx.url);
  b.socket.emit(EV.ROOM_JOIN, { code: created.room.code, name: 'Retador' }, () => {});
  await waitFor(b.socket, EV.ROOM_JOINED);
  b.socket.emit(EV.ROOM_READY, { ready: true });
  await waitUntil(() => true, 200);
  const firstStart = waitFor(a.socket, EV.RACE_START);
  await emitAck(a.socket, EV.ROOM_START, {});
  await firstStart;

  const restartA = waitFor(a.socket, EV.RACE_START);
  const restartB = waitFor(b.socket, EV.RACE_START);
  const ack = await emitAck(a.socket, EV.RACE_RESTART, {});
  assert.equal(ack.ok, true);
  const [ra, rb] = await Promise.all([restartA, restartB]);
  assert.ok(ra.countdown > 0 && rb.countdown > 0);
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('si el anfitrión abandona, el control se transfiere', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Host', isPublic: false }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);
  const b = await connectClient(ctx.url);
  b.socket.emit(EV.ROOM_JOIN, { code: created.room.code, name: 'Retador' }, () => {});
  await waitFor(b.socket, EV.ROOM_JOINED);

  const hostChanged = waitFor(b.socket, EV.HOST_CHANGED);
  a.socket.emit(EV.ROOM_LEAVE, {}, () => {});
  const hc = await hostChanged;
  assert.equal(hc.hostId, b.welcome.playerId);
  closeSocket(a.socket);
  closeSocket(b.socket);
});

test('un jugador no puede iniciar si no es el anfitrión', async () => {
  const a = await connectClient(ctx.url);
  a.socket.emit(EV.ROOM_CREATE, { name: 'Host', isPublic: false }, () => {});
  const created = await waitFor(a.socket, EV.ROOM_CREATED);
  const b = await connectClient(ctx.url);
  b.socket.emit(EV.ROOM_JOIN, { code: created.room.code, name: 'Retador' }, () => {});
  await waitFor(b.socket, EV.ROOM_JOINED);

  const errPromise = waitFor(b.socket, EV.ERROR);
  const ack = await emitAck(b.socket, EV.ROOM_START, {});
  const err = await errPromise;
  assert.equal(ack.ok, false);
  assert.equal(err.code, ERR.NOT_HOST);
  closeSocket(a.socket);
  closeSocket(b.socket);
});