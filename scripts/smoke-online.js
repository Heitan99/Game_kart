#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, sleep } from './lib/chrome.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const URL_TARGET = process.argv[2] || 'http://127.0.0.1:3000/';
const OUT_PNG = process.argv[3] || join(ROOT, 'smoke-online.png');

async function poll(evaluate, expr, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true;
    await sleep(200);
  }
  return false;
}

async function main() {
  const result = await withPage(URL_TARGET, async ({ evaluate, screenshot, problems }) => {
    // 1) Menú: nombre y entrada al modo online.
    await evaluate(`(function(){
      var n = document.getElementById('player-name');
      n.value = 'SmokeTester';
      n.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btn-online').click();
    })()`);

    const lobbyOpen = await poll(evaluate,
      `(document.getElementById('overlay-lobby').classList.contains('on'))`);
    const connected = await poll(evaluate, `!!(window.KART_CAMPUS.network && window.KART_CAMPUS.network.connected)`);

    // 2) Crear sala pública.
    await evaluate(`document.getElementById('btn-create-room').click()`);
    const roomReady = await poll(evaluate,
      `(function(){var p=document.getElementById('room-panel');var c=document.getElementById('room-code');return p && !p.classList.contains('hidden') && c && c.textContent.length >= 4;})()`);

    const state = JSON.parse(await evaluate(`JSON.stringify({
      lobbyOpen: document.getElementById('overlay-lobby').classList.contains('on'),
      roomCode: (document.getElementById('room-code')||{}).textContent || '',
      players: (document.getElementById('room-players')||{}).children ? document.getElementById('room-players').children.length : 0,
      you: !!(window.KART_CAMPUS.online && window.KART_CAMPUS.online.room),
      connected: !!(window.KART_CAMPUS.network && window.KART_CAMPUS.network.connected),
      startVisible: !document.getElementById('btn-start-race').classList.contains('hidden')
    })`));

    const png = await screenshot(OUT_PNG);
    return { lobbyOpen, connected, roomReady, state, png, problems };
  });

  mkdirSync(dirname(OUT_PNG), { recursive: true });
  writeFileSync(OUT_PNG, result.png);

  console.log('Estado online:', JSON.stringify(result.state, null, 2));
  console.log('Captura guardada en:', OUT_PNG);
  if (result.problems.length) {
    console.log('\nProblemas detectados (' + result.problems.length + '):');
    for (const p of result.problems.slice(0, 30)) console.log('  - ' + p);
  } else {
    console.log('\nSin errores de consola ni excepciones.');
  }

  const s = result.state;
  const ok = result.lobbyOpen && result.connected && result.roomReady &&
    s.roomCode.length >= 4 && s.players >= 1 && s.you && s.startVisible &&
    result.problems.length === 0;
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => { console.error('Smoke online falló:', err.message); process.exit(1); });
