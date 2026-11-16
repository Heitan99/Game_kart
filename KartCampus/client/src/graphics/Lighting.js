/* =====================================================================
   KART CAMPUS — iluminación
   ===================================================================== */
import { THREE } from './three.js';
import { CONFIG } from '../core/Config.js';

export class Lighting {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3e5a30, 0.62);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.16);
    scene.add(this.ambient);

    this.dir = new THREE.DirectionalLight(0xfff1d8, 1.12);
    this.dir.position.set(90, 150, 70);
    this.dir.castShadow = quality.shadows;
    if (quality.shadows) {
      const size = quality.shadowMapSize || CONFIG.graphics.shadowMapSize;
      this.dir.shadow.mapSize.set(size, size);
      const cam = this.dir.shadow.camera;
      cam.left = -110; cam.right = 110; cam.top = 110; cam.bottom = -110;
      cam.near = 1; cam.far = 620;
      cam.updateProjectionMatrix();
      this.dir.shadow.bias = -0.0004;
      this.dir.shadow.normalBias = 0.6;
    }
    scene.add(this.dir);
    scene.add(this.dir.target);
  }

  update(focus) {
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    this.dir.position.set(fx + 90, 150, fz + 70);
    this.dir.target.position.set(fx, 0, fz);
    this.dir.target.updateMatrixWorld();
  }

  setShadows(on) {
    this.dir.castShadow = !!on;
  }
}