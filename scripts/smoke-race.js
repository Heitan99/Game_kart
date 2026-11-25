#!/usr/bin/env node
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, sleep } from './lib/chrome.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const URL_TARGET = process.argv[2] || 'http://127.0.0.1:3000/';

async function poll(evaluate, expr, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true;
    await sleep(200);
  }
  return false;
}

const NAME_FN = (n) => `(function(){
  var i = document.getElementById('player-name');
  i.value = ${JSON.stringify(n)};
  i.dispatchEvent(new Event('input', { bubbles: true }));
})()`;

async function main() {
  const summary = { errors: [] };

  await withPage(URL_TARGET, async (A) => {
    // Anfitrión: entra al modo online y crea sala.
    await A.evaluate(NAME_FN('HostA'));
    await A.evaluate(`document.getElementById('btn-online').click()`);
    await poll(A.evaluate, `document.getElementById('overlay-lobby').classList.contains('on')`);
    await poll(A.evaluate, `!!(window.KART_CAMPUS.network && window.KART_CAMPUS.network.connected)`, 12000);
    await A.evaluate(`document.getElementById('btn-create-room').click()`);
    const created = await poll(A.evaluate,
      `(function(){var c=document.getElementById('room-code');return c && c.textContent && c.textContent !== '-----' && c.textContent.length >= 4;})()`);
    const code = created ? await A.evaluate(`document.getElementById('room-code').textContent`) : null;
    summary.roomCode = code;
    summary.hostCreatedRoom = created;

    await withPage(URL_TARGET, async (B) => {
      // Invitado: entra al modo online y se une con el código.
      await B.evaluate(NAME_FN('GuestB'));
      await B.evaluate(`document.getElementById('btn-online').click()`);
      await poll(B.evaluate, `document.getElementById('overlay-lobby').classList.contains('on')`);
      await poll(B.evaluate, `!!(window.KART_CAMPUS.network && window.KART_CAMPUS.network.connected)`, 12000);
      await B.evaluate(`(function(){
        var j = document.getElementById('join-code');
        j.value = ${JSON.stringify(code)};
        j.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('btn-join-room').click();
      })()`);
      const joined = await poll(B.evaluate,
        `(function(){var p=document.getElementById('room-players');return p && p.children.length >= 2;})()`);
      summary.guestJoined = joined;
      summary.guestUi = JSON.parse(await B.evaluate(`JSON.stringify({
        panelHidden: document.getElementById('room-panel').classList.contains('hidden'),
        players: document.getElementById('room-players').children.length,
        code: (document.getElementById('room-code')||{}).textContent || '',
        status: (document.getElementById('lobby-status')||{}).textContent || '',
        room: window.KART_CAMPUS.online && window.KART_CAMPUS.online.room ? window.KART_CAMPUS.online.room.code : null,
        state: window.KART_CAMPUS.state.current
      })`));

      // El invitado se marca listo.
      await B.evaluate(`document.getElementById('btn-ready').click()`);
      const hostSeesTwo = await poll(A.evaluate,
        `(function(){var p=document.getElementById('room-players');return p && p.children.length >= 2;})()`);
      summary.hostSeesTwo = hostSeesTwo;

      // El anfitrión inicia la carrera.
      await A.evaluate(`document.getElementById('btn-start-race').click()`);
      const startedA = await poll(A.evaluate,
        `window.KART_CAMPUS && (window.KART_CAMPUS.state.current === 'countdown' || window.KART_CAMPUS.state.current === 'racing')`, 12000);
      const startedB = await poll(B.evaluate,
        `window.KART_CAMPUS && (window.KART_CAMPUS.state.current === 'countdown' || window.KART_CAMPUS.state.current === 'racing')`, 12000);
      // Espera a que termine la cuenta atrás en ambos clientes.
      const racingA = await poll(A.evaluate, `window.KART_CAMPUS.state.current === 'racing'`, 15000);
      const racingB = await poll(B.evaluate, `window.KART_CAMPUS.state.current === 'racing'`, 15000);
      summary.startedA = startedA;
      summary.startedB = startedB;
      summary.racingA = racingA;
      summary.racingB = racingB;

      // Ambos aceleran a fondo.
      await A.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))`);
      await B.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))`);
      await sleep(4500);

      const aState = JSON.parse(await A.evaluate(`JSON.stringify({
        state: window.KART_CAMPUS.state.current,
        speed: window.KART_CAMPUS.playerSync ? window.KART_CAMPUS.playerSync.state.speed : 0,
        remote: window.KART_CAMPUS.remoteKarts.size,
        net: window.KART_CAMPUS.network.connected
      })`));
      summary.clientA = aState;
      summary.errors.push(...A.problems.map((p) => 'A: ' + p));

      // El invitado debe ver moverse al anfitrión vía snapshots interpolados.
      const sampleB = async () => JSON.parse(await B.evaluate(`(function(){
        var g = window.KART_CAMPUS; var id = null;
        g.remoteKarts.forEach(function(v, k){ if (id === null) id = k; });
        if (id === null) return JSON.stringify({ id: null });
        var s = g.interpolation.sample(id);
        return JSON.stringify({ id: id, x: s ? s.x : null, z: s ? s.z : null, speed: s ? s.speed : null, state: g.state.current });
      })()`));
      const s1 = await sampleB();
      await sleep(1200);
      const s2 = await sampleB();
      summary.clientB = { first: s1, second: s2 };
      const moved = s1.x !== null && s2.x !== null ? Math.hypot(s2.x - s1.x, s2.z - s1.z) : 0;
      summary.guestSeesMovement = moved > 0.5;
      summary.guestMovedDistance = Math.round(moved * 100) / 100;
      summary.errors.push(...B.problems.map((p) => 'B: ' + p));
    });
  });

  console.log('Resumen de la carrera online:', JSON.stringify(summary, null, 2));

  const ok = summary.hostCreatedRoom && summary.guestJoined && summary.hostSeesTwo &&
    summary.racingA && summary.racingB && summary.clientA.net &&
    summary.clientA.remote >= 1 && summary.guestSeesMovement && summary.errors.length === 0;
  if (!ok) {
    console.error('\nFALLO: la carrera online no superó todas las comprobaciones.');
  } else {
    console.log('\nOK: dos navegadores sincronizados en la misma carrera.');
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => { console.error('Smoke race falló:', err.message); process.exit(1); });
