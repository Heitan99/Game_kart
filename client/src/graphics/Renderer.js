import { THREE } from './three.js';

export class Renderer {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality.antialias,
        powerPreference: 'high-performance',
        alpha: false
      });
    } catch (err) {
      throw new Error('Tu navegador no pudo iniciar WebGL. Activa la aceleración por hardware.');
    }
    this.renderer.setPixelRatio(quality.maxPixelRatio);
    this.renderer.setSize(window.innerWidth, Math.max(1, window.innerHeight), false);
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputEncoding' in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.autoClear = true;
  }

  resize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    return { w, h };
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = !!on;
    this.quality.shadows = !!on;
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
}