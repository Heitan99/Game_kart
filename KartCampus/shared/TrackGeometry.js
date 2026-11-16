/* =====================================================================
   KART CAMPUS — geometría del circuito (datos puros)
   Anillo rectangular con esquinas redondeadas. Sirve para:
     - render del asfalto/bordillos en el cliente
     - proyección y progreso en cliente y servidor
     - validación de checkpoints en el servidor
   ===================================================================== */
import { CONFIG, mod, clamp } from './GameConfig.js';

/** Construye la polilínea del eje del circuito. */
export function buildCenterlinePoints(config = CONFIG) {
  const hw = config.track.halfWidthX;
  const hd = config.track.halfDepthZ;
  const R = config.track.cornerRadius;
  const step = config.track.sampleStep;
  const pts = [];

  function addLine(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
    }
  }
  function addArc(cx, cz, a0, a1) {
    const len = Math.abs(a1 - a0) * R;
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });
    }
  }

  // Comienza en el centro de la recta inferior, avanzando hacia +X.
  addLine(0, -hd, hw - R, -hd);
  addArc(hw - R, -hd + R, -Math.PI / 2, 0);
  addLine(hw, -hd + R, hw, hd - R);
  addArc(hw - R, hd - R, 0, Math.PI / 2);
  addLine(hw - R, hd, -hw + R, hd);
  addArc(-hw + R, hd - R, Math.PI / 2, Math.PI);
  addLine(-hw, hd - R, -hw, -hd + R);
  addArc(-hw + R, -hd + R, Math.PI, Math.PI * 1.5);
  addLine(-hw + R, -hd, 0, -hd); // cierra sin duplicar el punto inicial
  return pts;
}

/** Precalcula tangentes, normales, longitudes y puertas. */
export function createTrackData(config = CONFIG) {
  const pts = buildCenterlinePoints(config);
  const n = pts.length;
  const tangents = new Array(n);
  const normals = new Array(n);
  const segLen = new Array(n);
  const cumDist = new Array(n + 1);
  cumDist[0] = 0;

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 0.0001;
    tangents[i] = { x: dx / len, z: dz / len };
    normals[i] = { x: -tangents[i].z, z: tangents[i].x };
    segLen[i] = len;
    cumDist[i + 1] = cumDist[i] + len;
  }

  const length = cumDist[n];
  const halfWidth = config.track.roadWidth * 0.5;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const data = {
    pts, tangents, normals, segLen, cumDist, length, halfWidth,
    bounds: { minX, maxX, minZ, maxZ },
    gates: []
  };

  // Puertas: meta (índice 0) + 4 checkpoints (índices 1..4)
  const fractions = [0].concat(config.race.checkpointFractions);
  data.gates = fractions.map(function (f, idx) {
    const sm = sampleTrackAtS(data, f * data.length);
    return {
      index: idx,
      isFinish: idx === 0,
      cpIndex: idx,
      x: sm.x, z: sm.z,
      tx: sm.tx, tz: sm.tz,
      nx: sm.nx, nz: sm.nz,
      halfWidth: data.halfWidth,
      s: f * data.length
    };
  });

  return data;
}

/** Muestreo del eje por distancia de arco. */
export function sampleTrackAtS(data, s) {
  const L = data.length;
  const n = data.pts.length;
  s = mod(s, L);
  let lo = 0, hi = n;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (data.cumDist[mid] <= s) lo = mid; else hi = mid;
  }
  if (lo >= n) lo = n - 1;
  const t = clamp((s - data.cumDist[lo]) / (data.segLen[lo] || 1), 0, 1);
  const a = data.pts[lo];
  const b = data.pts[(lo + 1) % n];
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    tx: data.tangents[lo].x,
    tz: data.tangents[lo].z,
    nx: data.normals[lo].x,
    nz: data.normals[lo].z,
    index: lo
  };
}

/**
 * Proyecta un punto al eje: segmento más cercano, distancia lateral y
 * progreso de arco. Con `hint` busca en una ventana local.
 */
export function projectToTrack(data, x, z, hint) {
  const pts = data.pts;
  const n = pts.length;
  let best = Infinity, bi = 0, bt = 0, bpx = 0, bpz = 0, bdx = 1, bdz = 0, blen2 = 1;

  function testSegment(i) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const abx = b.x - a.x, abz = b.z - a.z;
    const apx = x - a.x, apz = z - a.z;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 0 ? (apx * abx + apz * abz) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = a.x + abx * t, pz = a.z + abz * t;
    const dx = x - px, dz = z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2; bi = i; bt = t; bpx = px; bpz = pz; bdx = abx; bdz = abz; blen2 = len2;
    }
  }

  if (hint !== undefined && hint !== null && hint >= 0) {
    for (let d = -14; d <= 14; d++) testSegment(mod(hint + d, n));
    if (best > 28 * 28) {
      best = Infinity;
      for (let i = 0; i < n; i++) testSegment(i);
    }
  } else {
    for (let i = 0; i < n; i++) testSegment(i);
  }

  const invLen = 1 / Math.sqrt(blen2 || 1);
  const tx = bdx * invLen, tz = bdz * invLen;
  const nx = -tz, nz = tx;
  const lateral = (x - bpx) * nx + (z - bpz) * nz;
  const s = data.cumDist[bi] + bt * data.segLen[bi];
  return {
    index: bi, s: s, lateral: lateral,
    distance: Math.sqrt(best),
    tx: tx, tz: tz, nx: nx, nz: nz
  };
}

/** ¿El punto está fuera del asfalto (con margen)? */
export function isGrassArea(data, x, z, margin) {
  const pr = projectToTrack(data, x, z);
  return Math.abs(pr.lateral) > data.halfWidth + (margin || 0);
}