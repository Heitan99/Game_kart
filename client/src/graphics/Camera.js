import { THREE } from './three.js';
import { CONFIG, STATE, clamp, lerp, smoothFactor } from '../core/Config.js';

export class CameraController {
  constructor(camera, config = CONFIG) {
    this.camera = camera;
    this.config = config;
    this.look = new THREE.Vector3();
    this.menuAngle = 0.6;
    this.shakeAmount = 0;
    this.shakeTime = 0;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  snapBehind(kart) {
    if (!kart) return;
    const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
    this.camera.position.set(
      kart.x - fx * this.config.camera.distance,
      this.config.camera.height,
      kart.z - fz * this.config.camera.distance
    );
    this.look.set(kart.x + fx * this.config.camera.lookAhead, 1.3, kart.z + fz * this.config.camera.lookAhead);
    this.camera.lookAt(this.look);
    this.camera.fov = this.config.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  updateMenu(dt) {
    this.menuAngle += dt * 0.075;
    this.camera.position.set(
      Math.cos(this.menuAngle) * this.config.camera.menuRadiusX,
      this.config.camera.menuHeight,
      Math.sin(this.menuAngle) * this.config.camera.menuRadiusZ
    );
    this.camera.lookAt(0, 6, 0);
    if (Math.abs(this.camera.fov - this.config.camera.fov) > 0.01) {
      this.camera.fov = this.config.camera.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  update(dt, state, kart) {
    if (!kart) return;

    if (state === STATE.MENU || state === STATE.LOBBY) {
      this.updateMenu(dt);
      return;
    }
    if (state === STATE.PAUSED) return;

    const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
    const speedRatio = clamp(Math.abs(kart.speed) / (kart.maxSpeed || 42), 0, 1.4);
    const dist = this.config.camera.distance + speedRatio * 2.2;
    const desiredX = kart.x - fx * dist;
    const desiredZ = kart.z - fz * dist;
    const desiredY = this.config.camera.height + speedRatio * 0.5 + (kart.offRoad ? 0.4 : 0);

    const follow = smoothFactor(this.config.camera.follow, dt);
    this.camera.position.x = lerp(this.camera.position.x, desiredX, follow);
    this.camera.position.y = lerp(this.camera.position.y, desiredY, follow);
    this.camera.position.z = lerp(this.camera.position.z, desiredZ, follow);

    this.look.x = lerp(this.look.x, kart.x + fx * this.config.camera.lookAhead, follow);
    this.look.y = lerp(this.look.y, 1.3, follow);
    this.look.z = lerp(this.look.z, kart.z + fz * this.config.camera.lookAhead, follow);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeAmount * Math.max(0, this.shakeTime);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    this.camera.lookAt(this.look);

    const targetFov = this.config.camera.fov +
      (kart.turboState === 'active' ? 9 : 0) + speedRatio * 3;
    this.camera.fov = lerp(this.camera.fov, targetFov, smoothFactor(4, dt));
    this.camera.updateProjectionMatrix();
  }

  shake(amount, time = 0.25) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, time);
  }
}