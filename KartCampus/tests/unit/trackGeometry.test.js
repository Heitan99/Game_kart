/* =====================================================================
   Pruebas unitarias — geometría del circuito
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../shared/GameConfig.js';
import {
  buildCenterlinePoints, createTrackData, sampleTrackAtS, projectToTrack, isGrassArea
} from '../../shared/TrackGeometry.js';

test('la polilínea del circuito es cerrada y razonable', () => {
  const pts = buildCenterlinePoints();
  assert.ok(pts.length > 100, 'suficientes muestras');
  // El anillo redondeado mide aproximadamente el rectángulo menos las esquinas.
  const track = createTrackData();
  const rect = 4 * (CONFIG.track.halfWidthX + CONFIG.track.halfDepthZ);
  assert.ok(track.length > rect * 0.8 && track.length < rect * 1.1, 'longitud del anillo plausible');
  assert.ok(Math.abs(track.halfWidth - CONFIG.track.roadWidth / 2) < 1e-9);
});

test('sampleTrackAtS es periódico y coherente', () => {
  const track = createTrackData();
  const a = sampleTrackAtS(track, 0);
  const b = sampleTrackAtS(track, track.length);
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6);
  const mid = sampleTrackAtS(track, track.length / 2);
  assert.ok(isFinite(mid.x) && isFinite(mid.z));
});

test('projectToTrack devuelve lateral ~0 sobre el eje', () => {
  const track = createTrackData();
  const s = track.length * 0.33;
  const p = sampleTrackAtS(track, s);
  const pr = projectToTrack(track, p.x, p.z);
  assert.ok(Math.abs(pr.lateral) < 0.05, 'lateral casi nulo sobre el eje');
  assert.ok(Math.abs(pr.s - s) < 3 || Math.abs(Math.abs(pr.s - s) - track.length) < 3);
});

test('isGrassArea distingue asfalto y césped', () => {
  const track = createTrackData();
  const p = sampleTrackAtS(track, track.length * 0.1);
  assert.equal(isGrassArea(track, p.x, p.z, 0), false, 'sobre el eje es asfalto');
  const gx = p.x + p.nx * (track.halfWidth + 5);
  const gz = p.z + p.nz * (track.halfWidth + 5);
  assert.equal(isGrassArea(track, gx, gz, 0), true, 'fuera del ancho es césped');
});

test('los límites del circuito engloban la pista', () => {
  const track = createTrackData();
  const b = track.bounds;
  assert.ok(b.minX < b.maxX && b.minZ < b.maxZ);
  for (const p of track.pts) {
    assert.ok(p.x >= b.minX - 1e-6 && p.x <= b.maxX + 1e-6);
    assert.ok(p.z >= b.minZ - 1e-6 && p.z <= b.maxZ + 1e-6);
  }
});
