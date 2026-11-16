/* =====================================================================
   Pruebas unitarias — controles táctiles simultáneos y calidad
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls } from '../../client/src/controls/TouchControls.js';
import { detectQuality, isPortrait } from '../../client/src/core/Config.js';
import { makeKartState, applyPhysics } from '../../shared/Physics.js';

test('varios punteros simultáneos: acelerar + girar a la izquierda', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'accel');
  assert.equal(tc.read().throttle, 1);
  assert.equal(tc.read().steer, 0);

  tc.applyPointer(2, 'left');
  const s = tc.read();
  assert.equal(s.throttle, 1, 'sigue acelerando');
  // Convención compartida con la física: steer positivo = izquierda.
  assert.equal(s.steer, 1, 'gira a la izquierda al mismo tiempo');
});

test('liberar un dedo mantiene el otro botón activo', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'accel');
  tc.applyPointer(2, 'left');
  tc.releasePointer(1);
  const s = tc.read();
  assert.equal(s.throttle, 0, 'se suelta el acelerador');
  assert.equal(s.steer, 1, 'el giro continúa');
});

test('pulsar DERECHA produce un giro real a la derecha', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'right');
  const rightSteer = tc.read().steer;
  const k = makeKartState({ id: 'r' });
  k.speed = 20;
  k.input.steer = rightSteer;
  const h0 = k.heading;
  for (let i = 0; i < 30; i++) applyPhysics(k, 1 / 60);
  assert.ok(k.heading < h0, 'el heading debe disminuir (la cámara mira en +forward)');
});

test('pulsar IZQUIERDA produce un giro real a la izquierda', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'left');
  const leftSteer = tc.read().steer;
  const k = makeKartState({ id: 'l' });
  k.speed = 20;
  k.input.steer = leftSteer;
  const h0 = k.heading;
  for (let i = 0; i < 30; i++) applyPhysics(k, 1 / 60);
  assert.ok(k.heading > h0, 'el heading debe aumentar (la cámara mira en +forward)');
});

test('izquierda y derecha simultáneas se cancelan', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'left');
  tc.applyPointer(2, 'right');
  assert.equal(tc.read().steer, 0);
});

test('turbo táctil produce un único impulso (latch)', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'turbo');
  assert.equal(tc.turboLatch, true);
  assert.equal(tc.consumeTurbo(), true);
  assert.equal(tc.consumeTurbo(), false, 'no se repite sin nueva pulsación');
  tc.releasePointer(1);
});

test('freno y acelerador simultáneos se registran', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'accel');
  tc.applyPointer(2, 'brake');
  const s = tc.read();
  assert.equal(s.throttle, 1);
  assert.equal(s.brake, 1);
});

test('clear deja todos los controles a cero', () => {
  const tc = new TouchControls();
  tc.applyPointer(1, 'accel');
  tc.applyPointer(2, 'right');
  tc.applyPointer(3, 'turbo');
  tc.clear();
  const s = tc.read();
  assert.equal(s.throttle, 0);
  assert.equal(s.steer, 0);
  assert.equal(s.brake, 0);
  assert.equal(tc.turboLatch, false);
});

test('detectQuality devuelve un perfil válido sin DOM (Node)', () => {
  const q = detectQuality();
  assert.equal(typeof q.mobile, 'boolean');
  assert.ok(q.maxPixelRatio >= 1);
  assert.ok(q.shadowMapSize > 0);
  assert.ok(q.drawDistance > 0);
  assert.ok(q.particleScale > 0);
});

test('detectQuality limita el pixel ratio en móvil', () => {
  const hadWindow = 'window' in globalThis;
  const prevWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: { devicePixelRatio: 3, matchMedia: () => ({ matches: true }) },
    configurable: true
  });
  try {
    const q = detectQuality();
    assert.equal(q.mobile, true);
    assert.ok(q.maxPixelRatio <= 2, 'el pixel ratio se limita en móvil');
  } finally {
    if (hadWindow) globalThis.window = prevWindow;
    else delete globalThis.window;
  }
});

test('isPortrait no falla sin ventana', () => {
  assert.equal(isPortrait(), false);
});