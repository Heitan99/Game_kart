import test from 'node:test';
import assert from 'node:assert/strict';
import { EV, decodeSnapshot } from '../../shared/Protocol.js';
import { CONFIG, clamp, wrapAngle } from '../../shared/GameConfig.js';
import { createTrackData, sampleTrackAtS, projectToTrack } from '../../shared/TrackGeometry.js';
import {
  startServer, connectClient, emitAck, waitFor, waitUntil, closeSocket
} from '../helpers/server.js';

// Una sola vuelta para que la prueba sea rápida pero real.
let ctx;

test.before(async () => {
  ctx = await startServer({ race: { laps: 1 } });
});
test.after(async () => { await ctx.close(); });

const TRACK = createTrackData();

/** Piloto automático: sigue el eje del circuito con antelación. */
function autopilot(kart, hint, seq, reverse) {
  const pr = projectToTrack(TRACK, kart.x, kart.z, hint);
  const look = clamp(9 + Math.abs(kart.speed) * 0.5, 9, 20);
  const tgt = sampleTrackAtS(TRACK, pr.s + look);
  const desired = Math.atan2(tgt.x - kart.x, tgt.z - kart.z);
  const diff = wrapAngle(desired - kart.heading);
  if (reverse) {
    return { seq, throttle: 0, brake: 1, steer: clamp(-diff * 2.4, -1, 1) || 1, turbo: false, index: pr.index };
  }
  const steer = clamp(diff * 2.4, -1, 1);
  const brake = Math.abs(diff) > 1.35 ? 0.5 : 0;
  return { seq, throttle: 1, brake, steer, turbo: false, index: pr.index };
}

/** Conecta un cliente listo para conducir con piloto automático. */
async function racer(url, code, name) {
  const c = await connectClient(url);
  c.id = c.welcome.playerId;
  c.name = name;
  c.snap = null;
  c.hint = 0;
  c.seq = 0;
  c.stuckMs = 0;
  c.finished = null;
  c.socket.on(EV.SNAPSHOT, (s) => { c.snap = decodeSnapshot(s); });
  c.socket.on(EV.RACE_FINISH, (d) => { c.finished = d; });

  if (code) {
    await emitAck(c.socket, EV.ROOM_JOIN, { code, name });
  } else {
    const createdP = waitFor(c.socket, EV.ROOM_CREATED);
    await emitAck(c.socket, EV.ROOM_CREATE, { name, isPublic: false, aiCount: 1 });
    c.created = await createdP;
  }
  return c;
}

/** Activa el bucle de conducción de un cliente a ~30 Hz. */
function drive(c) {
  c.timer = setInterval(() => {
    if (!c.snap) return;
    const k = c.snap.karts.find((x) => x.id === c.id);
    if (!k || k.finished) return;
    if (Math.abs(k.speed) < 1.5) c.stuckMs += 33; else c.stuckMs = 0;
    const reverse = c.stuckMs > 1200 && c.stuckMs < 2600;
    if (c.stuckMs > 2800) c.stuckMs = 0;
    const inp = autopilot(k, c.hint, ++c.seq, reverse);
    c.hint = inp.index;
    c.socket.emit(EV.INPUT, { seq: inp.seq, throttle: inp.throttle, brake: inp.brake, steer: inp.steer, turbo: inp.turbo });
  }, 33);
}

function stopDriving(c) {
  if (c && c.timer) { clearInterval(c.timer); c.timer = null; }
}

test('carrera online 2 humanos + 1 IA: sincronizada, validada y con resultados compartidos',
  { timeout: 150000 }, async () => {
    const host = await racer(ctx.url, null, 'HostUno');
    const guest = await racer(ctx.url, host.created.room.code, 'GuestDos');

    // El invitado se marca listo y el anfitrión inicia.
    guest.socket.emit(EV.ROOM_READY, { ready: true });
    await waitUntil(() => true, 250);

    const startHost = waitFor(host.socket, EV.RACE_START);
    const startGuest = waitFor(guest.socket, EV.RACE_START);
    const finishHost = waitFor(host.socket, EV.RACE_FINISH, 140000);
    const finishGuest = waitFor(guest.socket, EV.RACE_FINISH, 140000);

    const ack = await emitAck(host.socket, EV.ROOM_START, {});
    assert.equal(ack.ok, true, 'el anfitrión inicia la carrera');

    const [sh, sg] = await Promise.all([startHost, startGuest]);
    assert.equal(sh.laps, 1, 'una vuelta configurada para la prueba');
    assert.equal(sh.karts.length, 3, '2 humanos + 1 IA');
    assert.deepEqual(
      sh.karts.map((k) => k.id).sort(),
      sg.karts.map((k) => k.id).sort(),
      'ambos reciben la misma parrilla'
    );

    drive(host);
    drive(guest);

    const [fh, fg] = await Promise.all([finishHost, finishGuest]);
    stopDriving(host);
    stopDriving(guest);

    // Resultados validados por el servidor y compartidos por igual.
    assert.equal(fh.results.length, 3);
    assert.deepEqual(fh.results, fg.results, 'los dos clientes reciben los mismos resultados');

    const humans = fh.results.filter((r) => r.isHuman);
    assert.equal(humans.length, 2, 'dos humanos clasificados');
    const ai = fh.results.find((r) => r.isHuman === false);
    assert.ok(ai, 'la IA de relleno también aparece');

    for (const r of fh.results) {
      assert.equal(r.finished, true, r.name + ' termina la carrera');
      assert.equal(r.laps, 1, 'una vuelta completada');
      assert.ok(r.finishTime > 0, 'tiempo final registrado');
      assert.equal(r.cpValidated, CONFIG.race.checkpoints, 'validó los 4 checkpoints de la vuelta');
    }
    const positions = fh.results.map((r) => r.position).sort((a, b) => a - b);
    assert.deepEqual(positions, [1, 2, 3], 'posiciones finales únicas 1..3');

    // Reinicio del anfitrión tras finalizar.
    const restartHost = waitFor(host.socket, EV.RACE_START);
    const restartGuest = waitFor(guest.socket, EV.RACE_START);
    const rAck = await emitAck(host.socket, EV.RACE_RESTART, {});
    assert.equal(rAck.ok, true, 'el anfitrión reinicia tras finalizar');
    const [rh, rg] = await Promise.all([restartHost, restartGuest]);
    assert.ok(rh.countdown > 0 && rg.countdown > 0, 'nueva cuenta atrás sincronizada');

    closeSocket(host.socket);
    closeSocket(guest.socket);
  });

test('un invitado no listo bloquea el inicio', async () => {
  const host = await connectClient(ctx.url);
  host.socket.emit(EV.ROOM_CREATE, { name: 'HostCheck', isPublic: false }, () => {});
  const created = await waitFor(host.socket, EV.ROOM_CREATED);
  const guest = await connectClient(ctx.url);
  guest.socket.emit(EV.ROOM_JOIN, { code: created.room.code, name: 'GuestNo' }, () => {});
  await waitFor(guest.socket, EV.ROOM_JOINED);

  const errP = waitFor(host.socket, EV.ERROR);
  const ack = await emitAck(host.socket, EV.ROOM_START, {});
  const err = await errP;
  assert.equal(ack.ok, false);
  assert.equal(err.code, 'NOT_READY', 'no se inicia con un jugador sin marcar listo');
  closeSocket(host.socket);
  closeSocket(guest.socket);
});
