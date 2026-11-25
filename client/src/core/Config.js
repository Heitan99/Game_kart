import { CONFIG } from '../../../shared/GameConfig.js';

export {
  CONFIG, STATE, KART_COLORS, AI_NAMES,
  clamp, lerp, mod, wrapAngle, wrapDelta, smoothFactor,
  formatTime, mulberry32
} from '../../../shared/GameConfig.js';

/** Ajustes propios del cliente. */
export const CLIENT = {
  interpDelay: CONFIG.network.interpDelay,
  correctionLerp: 0.18,
  cameraShake: true,
  touchDeadzone: 0.12
};

/** Detecta un perfil de calidad razonable según el dispositivo. */
export function detectQuality() {
  const win = typeof window !== 'undefined' ? window : {};
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = nav.userAgent || '';
  const coarse = typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) || coarse;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const low = mobile && (cores <= 4 || mem <= 3);
  const dpr = win.devicePixelRatio || 1;

  return {
    mobile,
    low,
    maxPixelRatio: mobile ? Math.min(dpr, 2) : Math.min(dpr, CONFIG.graphics.maxPixelRatio),
    shadows: !low,
    shadowMapSize: low ? 1024 : CONFIG.graphics.shadowMapSize,
    drawDistance: low ? 1800 : CONFIG.graphics.drawDistance,
    particleScale: low ? 0.4 : (mobile ? 0.7 : 1),
    antialias: !mobile
  };
}

/** Orientación apaisada recomendada. */
export function isPortrait() {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth * 1.05;
}