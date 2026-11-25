import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, connectClient, closeSocket } from '../helpers/server.js';

let ctx;

test.before(async () => { ctx = await startServer(); });
test.after(async () => { await ctx.close(); });

test('el endpoint /health responde con el estado del servidor', async () => {
  const res = await fetch(ctx.url + '/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.name, 'kart-campus');
  assert.equal(typeof body.rooms, 'number');
});

test('el servidor sirve el cliente HTML y los módulos compartidos', async () => {
  const html = await fetch(ctx.url + '/');
  assert.equal(html.status, 200);
  const text = await html.text();
  assert.ok(text.includes('game-canvas'));
  assert.ok(text.includes('/vendor/three/three.min.js'));

  const shared = await fetch(ctx.url + '/shared/GameConfig.js');
  assert.equal(shared.status, 200);
  const js = await shared.text();
  assert.ok(js.includes('KART CAMPUS'));
});

test('un cliente recibe `welcome` con id, token y ajustes de red', async () => {
  const { socket, welcome } = await connectClient(ctx.url);
  assert.ok(welcome.playerId && welcome.playerId.startsWith('p_'));
  assert.ok(welcome.token && welcome.token.length >= 32);
  assert.equal(welcome.network.maxPlayers >= 2, true);
  assert.ok(welcome.serverTime > 0);
  closeSocket(socket);
});

test('varios clientes obtienen identidades distintas', async () => {
  const a = await connectClient(ctx.url);
  const b = await connectClient(ctx.url);
  assert.notEqual(a.welcome.playerId, b.welcome.playerId);
  assert.notEqual(a.welcome.token, b.welcome.token);
  closeSocket(a.socket);
  closeSocket(b.socket);
});