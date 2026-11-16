/* =====================================================================
   Pruebas unitarias — simulación autoritativa del servidor
   Comprueba la carrera completa, la validación de entradas y de reglas.
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation } from '../../server/src/GameSimulation.js';
import { STATE, CONFIG } from '../../shared/GameConfig.js';

const FIXED = CONFIG.physics.fixedDt;

function run(sim, seconds) {
  let t = 0;
  while (t < seconds) { sim.tick(FIXED); t += FIXED; }
}

test('tres IAs completan 3 vueltas y la carrera termina', () => {
  const sim = new GameSimulation();
  sim.lineup([], 3);
  sim.start();
  let t = 0;
  while (t < 200 && !sim.allFinished()) { sim.tick(FIXED); t += FIXED; }
  assert.equal(sim.allFinished(), true, 'todas las IA deben terminar');
  assert.equal(sim.race.state, STATE.RESULTS);
  for (const k of sim.karts) {
    assert.equal(k.laps, CONFIG.race.laps);
    assert.equal(k.cpValidated, CONFIG.race.laps * CONFIG.race.checkpoints);
    assert.ok(k.finishPlace >= 1 && k.finishPlace <= 3);
  }
});

test('las entradas humanas avanzan al kart', () => {
  const sim = new GameSimulation();
  sim.lineup([{ id: 'p1', name: 'TÚ', colorHex: 0x2fe3ff }], 0);
  sim.start();
  run(sim, CONFIG.race.countdown + 0.2);
  const before = sim.karts[0].progress;
  for (let i = 0; i < 120; i++) {
    sim.setInput('p1', { seq: i + 1, throttle: 1, brake: 0, steer: 0, turbo: false });
    sim.tick(FIXED);
  }
  assert.ok(sim.karts[0].progress > before + 2, 'debe avanzar');
  assert.ok(sim.karts[0].speed > 10, 'debe ganar velocidad');
});

test('setInput rechaza a karts inexistentes o IA', () => {
  const sim = new GameSimulation();
  sim.lineup([{ id: 'p1', name: 'TÚ', colorHex: 0x2fe3ff }], 1);
  assert.equal(sim.setInput('nadie', { seq: 1, throttle: 1, brake: 0, steer: 0 }), false);
  const aiId = sim.karts.find((k) => !k.isHuman).id;
  assert.equal(sim.setInput(aiId, { seq: 1, throttle: 1, brake: 0, steer: 0 }), false);
});

test('el turbo del servidor eleva la velocidad por encima de la base', () => {
  const sim = new GameSimulation();
  sim.lineup([{ id: 'p1', name: 'T', colorHex: 0x2fe3ff }], 0);
  sim.start();
  run(sim, CONFIG.race.countdown + 0.2);
  // Acelera a fondo sin turbo hasta estabilizar.
  for (let i = 0; i < 400; i++) {
    sim.setInput('p1', { seq: i + 1, throttle: 1, brake: 0, steer: 0, turbo: false });
    sim.tick(FIXED);
  }
  const base = sim.karts[0].speed;
  sim.setInput('p1', { seq: 9999, throttle: 1, brake: 0, steer: 0, turbo: true });
  run(sim, 0.6);
  assert.equal(sim.karts[0].turboState, 'active');
  assert.ok(sim.karts[0].speed > base, 'el turbo acelera por encima de la base');
});

test('fullState y results devuelven la estructura esperada', () => {
  const sim = new GameSimulation();
  sim.lineup([{ id: 'p1', name: 'TÚ', colorHex: 0x2fe3ff }], 2);
  const full = sim.fullState();
  assert.equal(full.karts.length, 3);
  assert.ok(full.trackLength > 0);
  assert.equal(full.race.laps, CONFIG.race.laps);
  const results = sim.results();
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.ok('position' in r && 'name' in r && 'finished' in r && 'laps' in r);
  }
});

test('la desconexión temporal cede el control a la IA', () => {
  const sim = new GameSimulation();
  sim.lineup([{ id: 'p1', name: 'TÚ', colorHex: 0x2fe3ff }], 0);
  sim.start();
  run(sim, CONFIG.race.countdown + 0.2);
  sim.setDisconnected('p1', true);
  const before = sim.karts[0].progress;
  for (let i = 0; i < 180; i++) sim.tick(FIXED);
  assert.ok(sim.karts[0].progress > before, 'la IA conduce al jugador desconectado');
  assert.equal(sim.setDisconnected('p1', false), true);
});
