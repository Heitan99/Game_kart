const THREE = (typeof window !== 'undefined') ? window.THREE : null;

if (!THREE) {
  throw new Error('Three.js no está disponible. Comprueba /vendor/three/three.min.js');
}

export { THREE };