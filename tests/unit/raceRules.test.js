import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../shared/GameConfig.js';
import { createTrackData } from '../../shared/TrackGeometry.js';
import {
  checkGates, onGateCrossed, computeStandings, updateKartProgress
} from '../../shared/RaceRules.js';
import { sampleTrackAtS } from '../../shared/TrackGeometry.js';
import { makeKartState, placeKartOnGrid } from '../../shared/Physics.js';

function freshRace() {
  return { state: 'racing', time: 0, countdown: 0, goTimer: 0, finishCount: 0, standings: [] };
}

test('el circuito tiene meta + 4 checkpoints en orden', () => {
  const track = createTrackData();
  assert.equal(track.gates.length, 5, 'meta + 4 checkpoints');
  assert.equal(track.gates[0].isFinish, true);
  for (let i = 1; i <= 4; i++) {
    assert.equal(track.gates[i].isFinish, false);
    assert.equal(track.gates[i].cpIndex, i);
  }
  // La distancia de arco debe crecer con el índice de puerta.
  for (let i = 1; i < track.gates.length; i++) {
    assert.ok(track.gates[i].s > track.gates[i - 1].s, 'puertas ordenadas por arco');
  }
});

test('los checkpoints solo cuentan en orden', () => {
  const track = createTrackData();
  const race = freshRace();
  const k = makeKartState({ id: 'a' });
  k.nextGate = 1;

  onGateCrossed(k, track.gates[1], race);
  assert.equal(k.nextGate, 2);
  assert.equal(k.cpValidated, 1);

  // Cruzar el 3 sin el 2 no debe avanzar.
  onGateCrossed(k, track.gates[3], race);
  assert.equal(k.nextGate, 2, 'no salta checkpoints');
  assert.equal(k.cpValidated, 1);
});

test('cruzar la meta sin completar los checkpoints no cuenta la vuelta', () => {
  const track = createTrackData();
  const race = freshRace();
  const k = makeKartState({ id: 'a' });
  k.nextGate = 1;
  onGateCrossed(k, track.gates[0], race);
  assert.equal(k.laps, 0);
  assert.equal(k.invalidFinishAttempts, 1);
});

test('una vuelta completa incrementa el contador', () => {
  const track = createTrackData();
  const race = freshRace();
  race.time = 10;
  const k = makeKartState({ id: 'a' });
  k.nextGate = 1;

  onGateCrossed(k, track.gates[1], race);
  onGateCrossed(k, track.gates[2], race);
  onGateCrossed(k, track.gates[3], race);
  onGateCrossed(k, track.gates[4], race);
  assert.equal(k.nextGate, 0, 'tras el 4º checkpoint toca la meta');
  onGateCrossed(k, track.gates[0], race);
  assert.equal(k.laps, 1);
  assert.equal(k.nextGate, 1, 'se reabre la secuencia');
});

test('completar las 3 vueltas finaliza la carrera', () => {
  const track = createTrackData();
  const race = freshRace();
  const k = makeKartState({ id: 'a' });
  k.nextGate = 1;

  for (let lap = 0; lap < CONFIG.race.laps; lap++) {
    race.time += 30;
    for (let cp = 1; cp <= CONFIG.race.checkpoints; cp++) onGateCrossed(k, track.gates[cp], race);
    onGateCrossed(k, track.gates[0], race);
  }
  assert.equal(k.laps, CONFIG.race.laps);
  assert.equal(k.finished, true);
  assert.ok(k.finishTime > 0);
  assert.equal(race.finishCount, 1);
  assert.equal(k.finishPlace, 1);
});

test('checkGates ignora saltos grandes (anti-teleport)', () => {
  const track = createTrackData();
  const race = freshRace();
  const k = makeKartState({ id: 'a' });
  k.nextGate = 1;
  const g = track.gates[1];
  // Salto muy superior a gateMaxStep.
  const big = CONFIG.race.gateMaxStep * 5;
  const px = g.x - g.tx * big;
  const pz = g.z - g.tz * big;
  checkGates(k, track, px, pz, g.x + g.tx * big, g.z + g.tz * big, race);
  assert.equal(k.cpValidated, 0, 'no valida un salto imposible');
});

test('computeStandings ordena por progreso y por plaza final', () => {
  const a = makeKartState({ id: 'a' }); a.progress = 100;
  const b = makeKartState({ id: 'b' }); b.progress = 200;
  const c = makeKartState({ id: 'c' }); c.finished = true; c.finishPlace = 1; c.progress = 10;
  const standings = computeStandings([a, b, c]);
  assert.equal(standings[0].id, 'c', 'los finalizados van primero');
  assert.equal(standings[1].id, 'b', 'después por progreso');
  assert.equal(standings[2].id, 'a');
  assert.equal(standings[0].position, 1);
});

test('updateKartProgress detecta el césped', () => {
  const track = createTrackData();
  const k = makeKartState({ id: 'a' });
  placeKartOnGrid(k, track);
  updateKartProgress(k, track, CONFIG.physics.fixedDt);
  assert.equal(k.offRoad, false, 'la parrilla está sobre el asfalto');
  // Se coloca muy lejos lateralmente usando un punto del eje conocido.
  const p = sampleTrackAtS(track, track.length * 0.25);
  k.x = p.x + p.nx * (track.halfWidth + 10);
  k.z = p.z + p.nz * (track.halfWidth + 10);
  k.trackHint = 0;
  updateKartProgress(k, track, CONFIG.physics.fixedDt);
  assert.equal(k.offRoad, true, 'debe detectarse el césped');
});
