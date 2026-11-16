/* =====================================================================
   KART CAMPUS — acceso a Three.js (build UMD local)
   Se carga como script clásico en index.html para no depender de un
   servidor de módulos ni de CDN.
   ===================================================================== */
const THREE = (typeof window !== 'undefined') ? window.THREE : null;

if (!THREE) {
  throw new Error('Three.js no está disponible. Comprueba /vendor/three/three.min.js');
}

export { THREE };