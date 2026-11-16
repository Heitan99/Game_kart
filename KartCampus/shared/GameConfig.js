/* =====================================================================
   KART CAMPUS — configuración y utilidades compartidas
   Este módulo es importado tanto por el cliente (navegador) como por el
   servidor (Node.js). No debe depender de Three.js, del DOM ni de Node.
   ===================================================================== */

/** Parámetros centrales del juego. */
export const CONFIG = {
  track: {
    halfWidthX: 150,      // semiancho del eje del circuito (m)
    halfDepthZ: 100,      // semiprofundidad del eje del circuito (m)
    cornerRadius: 50,     // radio de las esquinas redondeadas (m)
    roadWidth: 18,        // ancho total del asfalto (m)
    curbWidth: 1.4,       // ancho del bordillo a cada lado (m)
    sampleStep: 2.2,      // separación entre muestras del eje (m)
    startLineDepth: 3.4   // profundidad de la línea de meta (m)
  },
  kart: {
    maxSpeed: 42,          // velocidad máxima base (m/s)
    accel: 24,             // aceleración (m/s^2)
    brake: 46,             // frenada (m/s^2)
    reverseMax: 14,        // velocidad máxima en reversa (m/s)
    reverseAccel: 16,      // aceleración en reversa (m/s^2)
    friction: 5.5,         // fricción al soltar acelerador (m/s^2)
    offRoadSpeedFactor: 0.34,
    offRoadDrag: 34,       // arrastre extra sobre césped (m/s^2)
    turnRate: 1.95,        // giro máximo (rad/s)
    turnSpeedRef: 11,      // velocidad a la que el giro alcanza su máximo
    steerSmoothing: 11,    // suavizado del volante
    radius: 1.55,          // radio de colisión (m)
    wheelRadius: 0.42
  },
  turbo: {
    duration: 2.0,         // segundos de impulso
    recharge: 8.0,         // segundos de recarga tras el impulso
    speedMultiplier: 1.5,  // multiplicador de velocidad máxima
    accelMultiplier: 1.85  // multiplicador de aceleración
  },
  race: {
    laps: 3,
    checkpoints: 4,
    countdown: 3.0,
    goDisplayTime: 0.9,
    checkpointFractions: [0.2, 0.4, 0.6, 0.8],
    gateMaxStep: 6.0,      // salto máximo válido al cruzar un control (m)
    grid: [
      { back: 8,  lateral: 4.2 },
      { back: 8,  lateral: -4.2 },
      { back: 17, lateral: 0 },
      { back: 17, lateral: 8.4 },
      { back: 17, lateral: -8.4 },
      { back: 26, lateral: 4.2 },
      { back: 26, lateral: -4.2 },
      { back: 26, lateral: 0 }
    ]
  },
  physics: {
    fixedDt: 1 / 60,       // paso fijo de simulación (s), idéntico cliente/servidor
    maxSubsteps: 8,
    maxDt: 0.1             // deltaTime máximo aceptado (s)
  },
  ai: {
    lookahead: 13,
    steerGain: 2.35,
    curveBrake: 1.15
  },
  network: {
    inputRate: 30,         // Hz de envío de entradas del cliente
    snapshotRate: 15,      // Hz de snapshots del servidor
    interpDelay: 0.12,     // s de retardo de interpolación remota
    reconnectGrace: 30,    // s para reconectar y recuperar la plaza
    maxPlayers: 8,
    roomTtl: 60 * 60,      // s de vida máxima de una sala con actividad
    emptyRoomTtl: 60,      // s de vida de una sala sin humanos
    maxInputsPerSecond: 90,
    maxEventsPerSecond: 30
  },
  graphics: {
    shadows: true,
    maxPixelRatio: 2,
    shadowMapSize: 2048,
    drawDistance: 2800,
    particleScale: 1
  },
  camera: {
    fov: 62,
    distance: 9.5,
    height: 4.6,
    follow: 6.5,
    lookAhead: 7.0,
    menuRadiusX: 252,
    menuRadiusZ: 205,
    menuHeight: 108
  },
  audio: {
    master: 0.55,
    engine: 0.32,
    effects: 0.7,
    ambient: 0.18
  }
};

/** Estados de la aplicación / carrera. */
export const STATE = Object.freeze({
  MENU: 'menu',
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  PAUSED: 'paused',
  RESULTS: 'results'
});

/** Paleta de karts (8 colores distinguibles). */
export const KART_COLORS = [
  0x2fe3ff, 0xff3b7a, 0xffb340, 0xb8ff45,
  0xa06bff, 0xff6a3d, 0x4dffb8, 0xff5ad0
];

/** Nombres sugeridos para rivales IA. */
export const AI_NAMES = ['VEGA', 'ORIÓN', 'NOVA', 'LYRA', 'ATLAS', 'SIRIO', 'JUNO', 'RIGEL'];

/* ------------------------------------------------------------------ */
/* Utilidades matemáticas                                             */
/* ------------------------------------------------------------------ */
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function mod(n, m) { return ((n % m) + m) % m; }

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export function wrapDelta(d, L) {
  const half = L * 0.5;
  while (d > half) d -= L;
  while (d < -half) d += L;
  return d;
}

export function smoothFactor(rate, dt) { return 1 - Math.exp(-rate * dt); }
export function dist2D(ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }

export function formatTime(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}

/** PRNG determinista (mulberry32). Igual en cliente y servidor. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}