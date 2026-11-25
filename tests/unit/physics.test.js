import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../shared/GameConfig.js';
import {
  makeKartState, placeKartOnGrid, applyPhysics, updateTurboState, resolveCollisions
} from '../../shared/Physics.js';
import { createTrackData } from '../../shared/TrackGeometry.js';

test('el turbo pasa por los estados active → recharging → ready', () => {
  const k = makeKartState({ id: 'a', isHuman: true });
  const dt = CONFIG.physics.fixedDt;

  k.input.turbo = true;
  updateTurboState(k, dt);
  assert.equal(k.turboState, 'active', 'debe activarse');
  assert.ok(Math.abs(k.turboTimer - CONFIG.turbo.duration) < 1e-6, 'el temporizador arranca lleno');
  k.input.turbo = false;

  // Consume los 2 s de impulso.
  let t = dt;
  while (t < CONFIG.turbo.duration + 0.05) {
    updateTurboState(k, dt);
    t += dt;
  }
  assert.equal(k.turboState, 'recharging', 'debe entrar en recarga');
  assert.ok(k.turboTimer > CONFIG.turbo.recharge - 0.2);

  // Consume la recarga de 8 s.
  let t2 = 0;
  while (t2 < CONFIG.turbo.recharge + 0.1) {
    updateTurboState(k, dt);
    t2 += dt;
  }
  assert.equal(k.turboState, 'ready', 'debe quedar listo');
});

test('el turbo incrementa la velocidad máxima', () => {
  const base = CONFIG.kart.maxSpeed;
  const maxTurbo = base * CONFIG.turbo.speedMultiplier;
  assert.ok(maxTurbo > base);
  assert.ok(Math.abs(maxTurbo - base * 1.5) < 1e-9);
});

test('la aceleración y la fricción mueven la velocidad', () => {
  const k = makeKartState({ id: 'a' });
  k.input.throttle = 1;
  for (let i = 0; i < 60; i++) applyPhysics(k, CONFIG.physics.fixedDt);
  assert.ok(k.speed > 5, 'debe ganar velocidad al acelerar');

  k.input.throttle = 0;
  const before = k.speed;
  for (let i = 0; i < 30; i++) applyPhysics(k, CONFIG.physics.fixedDt);
  assert.ok(k.speed < before, 'debe frenar al soltar');
});

test('el césped reduce la velocidad máxima', () => {
  const k = makeKartState({ id: 'a' });
  k.offRoad = true;
  k.input.throttle = 1;
  for (let i = 0; i < 240; i++) applyPhysics(k, CONFIG.physics.fixedDt);
  assert.ok(k.speed <= CONFIG.kart.maxSpeed * CONFIG.kart.offRoadSpeedFactor + 0.5);
});

test('la frenada permite retroceder hasta el límite', () => {
  const k = makeKartState({ id: 'a' });
  k.input.brake = 1;
  for (let i = 0; i < 300; i++) applyPhysics(k, CONFIG.physics.fixedDt);
  assert.ok(k.speed <= -1, 'debe retroceder');
  assert.ok(k.speed >= -CONFIG.kart.reverseMax - 0.1, 'no debe superar el límite de reversa');
});

test('resolveCollisions separa dos karts solapados', () => {
  const a = makeKartState({ id: 'a' });
  const b = makeKartState({ id: 'b' });
  const minD = a.radius + b.radius;
  a.x = 0; a.z = 0; a.speed = 20;
  b.x = 0.4; b.z = 0; b.speed = 20;
  resolveCollisions([a, b]);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  assert.ok(dist >= minD - 0.01, 'deben quedar separados');
});

test('placeKartOnGrid coloca el kart detrás de la meta', () => {
  const track = createTrackData();
  const k = makeKartState({ id: 'a', gridSlot: 0 });
  placeKartOnGrid(k, track);
  assert.ok(k.progress < 0, 'el progreso inicial parte en negativo (parrilla)');
  assert.equal(k.laps, 0);
  assert.equal(k.nextGate, 1);
});
