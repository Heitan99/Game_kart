import { THREE } from './three.js';
import { createTrackData } from '../../../shared/TrackGeometry.js';
import { mulberry32 } from '../core/Config.js';
import { Lighting } from './Lighting.js';
import { TrackView } from './TrackView.js';
import { Environment } from './Environment.js';
import { makeSkyTexture } from './Textures.js';

export class SceneManager {
  constructor(quality) {
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc7e2);
    this.scene.fog = new THREE.Fog(
      0xaecde0,
      Math.max(320, quality.drawDistance * 0.16),
      quality.drawDistance
    );

    this.buildSky();
    this.lighting = new Lighting(this.scene, quality);

    this.track = createTrackData();
    this.trackView = new TrackView(this.scene, this.track);
    this.environment = new Environment(this.scene, this.track, quality);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(2200, 32, 20);
    const mat = new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    this.scene.add(dome);

    const rng = mulberry32(4242);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55, fog: false, depthWrite: false
    });
    this.cloudGroup = new THREE.Group();
    const count = this.quality.low ? 6 : 12;
    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rng() * 4);
      for (let p = 0; p < puffs; p++) {
        const s = 18 + rng() * 26;
        const m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat);
        m.position.set((p - puffs / 2) * s * 0.9, (rng() - 0.5) * 10, (rng() - 0.5) * 18);
        m.scale.y = 0.42;
        cloud.add(m);
      }
      const ang = (i / count) * Math.PI * 2 + rng() * 0.4;
      const rad = 520 + rng() * 520;
      cloud.position.set(Math.cos(ang) * rad, 180 + rng() * 120, Math.sin(ang) * rad);
      this.cloudGroup.add(cloud);
    }
    this.scene.add(this.cloudGroup);
  }

  update(focus, dt) {
    this.lighting.update(focus);
    if (this.cloudGroup) this.cloudGroup.rotation.y += dt * 0.0018;
  }
}