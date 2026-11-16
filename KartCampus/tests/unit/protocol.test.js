/* =====================================================================
   Pruebas unitarias — protocolo, saneado y snapshots
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeName, validateName, normalizeCode, sanitizeInput, hasOnlyKeys,
  encodeSnapshot, decodeSnapshot, EV, ERR
} from '../../shared/Protocol.js';
import { makeKartState } from '../../shared/Physics.js';

test('sanitizeName elimina etiquetas y recorta a 16', () => {
  assert.equal(sanitizeName('<script>hola</script>'), 'scriptholascript');
  assert.equal(sanitizeName('   a   b   '), 'a b');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(sanitizeName(123), '');
});

test('validateName exige 2–16 caracteres con letras o números', () => {
  assert.equal(validateName('A'), null);
  assert.equal(validateName('  '), null);
  assert.equal(validateName('<b>'), null);
  assert.equal(validateName('Vega'), 'Vega');
  assert.equal(validateName('Piloto 7'), 'Piloto 7');
});

test('normalizeCode acepta 4–6 A-Z0-9 y rechaza el resto', () => {
  assert.equal(normalizeCode('ab12'), 'AB12');
  assert.equal(normalizeCode('a-b-c-d'), 'ABCD');
  assert.equal(normalizeCode('abc'), null, 'demasiado corto');
  assert.equal(normalizeCode('abcdefg'), null, 'demasiado largo');
  assert.equal(normalizeCode('!!!!'), null);
  assert.equal(normalizeCode(42), null);
});

test('sanitizeInput acota y rechaza entradas malformadas', () => {
  const ok = sanitizeInput({ seq: 3, throttle: 2, brake: -1, steer: 5, turbo: true });
  assert.deepEqual(ok, { seq: 3, throttle: 1, brake: 0, steer: 1, turbo: true });

  assert.equal(sanitizeInput(null), null);
  assert.equal(sanitizeInput({ seq: NaN, throttle: 1, brake: 0, steer: 0 }), null);
  assert.equal(sanitizeInput({ seq: 1, throttle: 'x', brake: 0, steer: 0 }), null);
  assert.equal(sanitizeInput({ seq: -5, throttle: 1, brake: 0, steer: 0 }), null);
});

test('hasOnlyKeys rechaza claves no permitidas', () => {
  assert.equal(hasOnlyKeys({ a: 1 }, ['a']), true);
  assert.equal(hasOnlyKeys({ a: 1, b: 2 }, ['a']), false);
  assert.equal(hasOnlyKeys(null, ['a']), false);
});

test('los snapshots se codifican y decodifican sin pérdida relevante', () => {
  const k = makeKartState({ id: 'p1', name: 'TÚ', colorHex: 0x2fe3ff, isHuman: true });
  k.x = 12.345; k.z = -67.891; k.heading = 1.234; k.speed = 33.33;
  k.laps = 2; k.nextGate = 3; k.cpValidated = 7; k.position = 2; k.offRoad = true;
  const race = { state: 'racing', time: 45.678, countdown: 0 };
  const snap = encodeSnapshot(race, [k]);
  assert.ok(snap.k && snap.k.length === 1);
  const dec = decodeSnapshot(snap);
  assert.equal(dec.state, 'racing');
  assert.ok(Math.abs(dec.time - 45.678) < 0.001);
  const dk = dec.karts[0];
  assert.equal(dk.id, 'p1');
  assert.equal(dk.name, 'TÚ');
  assert.equal(dk.colorHex, 0x2fe3ff);
  assert.equal(dk.laps, 2);
  assert.equal(dk.nextGate, 3);
  assert.equal(dk.offRoad, true);
  assert.ok(Math.abs(dk.x - 12.35) < 0.01);
});

test('los nombres de evento no colisionan', () => {
  const values = Object.values(EV);
  assert.equal(new Set(values).size, values.length);
  assert.ok(ERR.ROOM_NOT_FOUND);
});
