#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './lib/chrome.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const URL_TARGET = process.argv[2] || 'http://127.0.0.1:3000/';
const OUT_PNG = process.argv[3] || join(ROOT, 'smoke.png');

async function main() {
  const result = await withPage(URL_TARGET, async ({ evaluate, screenshot, problems }) => {
    const state = JSON.parse(await evaluate(
      'JSON.stringify({' +
      'game: !!window.KART_CAMPUS,' +
      'bootOff: !!(document.getElementById("boot") && document.getElementById("boot").classList.contains("off")),' +
      'canvas: !!document.getElementById("game-canvas"),' +
      'menu: !!(document.getElementById("overlay-menu") && document.getElementById("overlay-menu").classList.contains("on")),' +
      'three: (typeof THREE !== "undefined"),' +
      'io: (typeof io !== "undefined"),' +
      'connected: !!(window.KART_CAMPUS && window.KART_CAMPUS.network && window.KART_CAMPUS.network.connected),' +
      'err: (document.getElementById("boot-msg")||{}).textContent || ""})'
    ));
    const png = await screenshot(OUT_PNG);
    return { state, png, problems };
  });

  mkdirSync(dirname(OUT_PNG), { recursive: true });
  writeFileSync(OUT_PNG, result.png);

  console.log('Estado del cliente:', JSON.stringify(result.state, null, 2));
  console.log('Captura guardada en:', OUT_PNG);
  if (result.problems.length) {
    console.log('\nProblemas detectados (' + result.problems.length + '):');
    for (const p of result.problems.slice(0, 30)) console.log('  - ' + p);
  } else {
    console.log('\nSin errores de consola ni excepciones.');
  }

  const s = result.state;
  const ok = s.game && s.three && s.io && s.canvas && s.bootOff && s.menu && result.problems.length === 0;
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => { console.error('Smoke test falló:', err.message); process.exit(1); });
