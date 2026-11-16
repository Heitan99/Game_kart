/* =====================================================================
   KART CAMPUS — colisiones (fachada del módulo compartido)
   ===================================================================== */
export { resolveCollisions } from '/shared/Physics.js';

/**
 * Separa dos karts concretos sin depender de la lista completa.
 * Se usa en efectos locales y pruebas.
 */
export function separatePair(a, b, minD) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz) || 0.0001;
  const dist = minD !== undefined ? minD : (a.radius + b.radius);
  if (d >= dist) return 0;
  const nx = dx / d, nz = dz / d;
  const overlap = dist - d;
  a.x -= nx * overlap * 0.5;
  a.z -= nz * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.z += nz * overlap * 0.5;
  return overlap;
}