#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage, sleep } from './lib/chrome.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const URL_TARGET = process.argv[2] || 'http://127.0.0.1:3000/';
const OUT_PNG = process.argv[3] || join(ROOT, 'smoke-solo.png');

async function poll(evaluate, expr, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true;
    await sleep(200);
  }
  return false;
}

async function main() {
  const result = await withPage(URL_TARGET, async ({ evaluate, screenshot, problems }) => {
    await evaluate(`(function(){
      var i = document.getElementById('player-name');
      i.value = 'SoloSmoke';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btn-solo').click();
    })()`);

    const started = await poll(evaluate,
      `window.KART_CAMPUS && (window.KART_CAMPUS.state.current === 'countdown' || window.KART_CAMPUS.state.current === 'racing')`);
    const racing = await poll(evaluate, `window.KART_CAMPUS.state.current === 'racing'`, 12000);

    // Acelera durante unos segundos.
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))`);
    await sleep(2500);

    const state = JSON.parse(await evaluate(`JSON.stringify({
      state: window.KART_CAMPUS.state.current,
      karts: window.KART_CAMPUS.soloRace ? window.KART_CAMPUS.soloRace.karts.length : 0,
      views: window.KART_CAMPUS.kartViews.size,
      speed: window.KART_CAMPUS.soloRace && window.KART_CAMPUS.soloRace.player ? window.KART_CAMPUS.soloRace.player.speed : 0,
      hud: document.getElementById('hud').classList.contains('on'),
      touch: window.KART_CAMPUS.touchDevice,
      laps: window.KART_CAMPUS.soloRace && window.KART_CAMPUS.soloRace.player ? window.KART_CAMPUS.soloRace.player.laps : -1
    })`));

    const png = await screenshot(OUT_PNG);
    return { started, racing, state, png, problems };
  });

  mkdirSync(dirname(OUT_PNG), { recursive: true });
  writeFileSync(OUT_PNG, result.png);

  console.log('Estado individual:', JSON.stringify(result.state, null, 2));
  console.log('Captura guardada en:', OUT_PNG);
  if (result.problems.length) {
    console.log('\nProblemas detectados (' + result.problems.length + '):');
    for (const p of result.problems.slice(0, 30)) console.log('  - ' + p);
  } else {
    console.log('\nSin errores de consola ni excepciones.');
  }

  const s = result.state;
  const ok = result.started && result.racing && s.karts === 3 && s.views === 3 &&
    s.speed > 1 && s.hud && result.problems.length === 0;
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => { console.error('Smoke solo falló:', err.message); process.exit(1); });