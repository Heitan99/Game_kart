/* =====================================================================
   KART CAMPUS — modelo 3D del kart y su vista
   ===================================================================== */
import { THREE } from '../graphics/three.js';
import { CONFIG } from '../core/Config.js';
import { canvasTex } from '../graphics/Textures.js';

function makeWheel(x, y, z, mats) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = 'YXZ';
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.34, 18), mats.tire);
  tire.rotation.z = Math.PI / 2;
  g.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.36, 12), mats.rim);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.4, 8), mats.hub);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  return g;
}

function makeLabelSprite(name, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(6,12,20,0.72)';
  const w = 236, h = 48, x = 10, y = 8, r = 14;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
  g.strokeStyle = '#' + colorHex.toString(16).padStart(6, '0');
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#eaf6ff';
  g.font = '800 26px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(name).slice(0, 16), 128, 34);

  const tex = canvasTex(canvas, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.4, 0.85, 1);
  sprite.position.set(0, 2.65, 0);
  return sprite;
}

/** Construye el grupo 3D de un kart. */
export function buildKartMesh(info, scene, options = {}) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const colorHex = info.colorHex !== undefined ? info.colorHex : 0x2fe3ff;

  const color = new THREE.Color(colorHex);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color, roughness: 0.34, metalness: 0.42,
    emissive: color, emissiveIntensity: 0.08
  });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xf2f7fb, roughness: 0.3, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.65, metalness: 0.35 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e1114, roughness: 0.96, metalness: 0.02 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcdd7e0, roughness: 0.28, metalness: 0.85 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x3a444f, roughness: 0.4, metalness: 0.7 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.8, metalness: 0.1 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 3.05), darkMat);
  chassis.position.y = 0.36;
  group.add(chassis);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.44, 1.85), bodyMat);
  body.position.set(0, 0.63, 0.12);
  group.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.3, 0.95), bodyMat);
  nose.position.set(0, 0.58, 1.36);
  group.add(nose);

  const noseWing = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.07, 0.34), accentMat);
  noseWing.position.set(0, 0.72, 1.86);
  group.add(noseWing);

  for (const sx of [-0.82, 0.82]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 1.25), bodyMat);
    pod.position.set(sx, 0.56, 0.08);
    group.add(pod);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 1.15), accentMat);
    stripe.position.set(sx, 0.7, 0.08);
    group.add(stripe);
  }

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.62), seatMat);
  seat.position.set(0, 0.83, -0.34);
  group.add(seat);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.66, 0.18), seatMat);
  backrest.position.set(0, 1.02, -0.66);
  group.add(backrest);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.3), darkMat);
  torso.position.set(0, 1.08, -0.18);
  group.add(torso);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.4, metalness: 0.1 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), headMat);
  head.position.set(0, 1.46, -0.16);
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), new THREE.MeshStandardMaterial({
    color: 0x11202e, roughness: 0.15, metalness: 0.6
  }));
  visor.position.set(0, 1.48, 0.02);
  group.add(visor);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 6), darkMat);
  column.rotation.x = Math.PI / 2 - 0.35;
  column.position.set(0, 0.98, 0.38);
  group.add(column);
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 18), darkMat);
  wheelRim.position.set(0, 1.03, 0.5);
  wheelRim.rotation.x = -0.35;
  group.add(wheelRim);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 0.36), accentMat);
  wing.position.set(0, 1.06, -1.42);
  group.add(wing);
  for (const sx of [-0.52, 0.52]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.14), darkMat);
    support.position.set(sx, 0.82, -1.42);
    group.add(support);
  }

  for (const zz of [0.98, -0.98]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.96, 8), hubMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.45, zz);
    group.add(axle);
  }

  const wheelMats = { tire: tireMat, rim: rimMat, hub: hubMat };
  const fl = makeWheel(-0.99, 0.45, 0.98, wheelMats);
  const fr = makeWheel(0.99, 0.45, 0.98, wheelMats);
  const rl = makeWheel(-0.99, 0.45, -0.98, wheelMats);
  const rr = makeWheel(0.99, 0.45, -0.98, wheelMats);
  group.add(fl, fr, rl, rr);

  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x7fe9ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (const sx of [-0.34, 0.34]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.0, 8), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(sx, 0.5, -1.9);
    flame.visible = false;
    group.add(flame);
    flames.push(flame);
  }

  group.traverse(function (o) {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  for (const f of flames) f.castShadow = false;

  let label = null;
  if (options.showLabel !== false) {
    label = makeLabelSprite(info.name || 'PILOTO', colorHex);
    group.add(label);
  }

  if (scene) scene.add(group);
  return { group, wheels: { fl, fr, rl, rr }, flames, label, colorHex };
}

/** Vista de un kart: sincroniza el grupo con el estado lógico. */
export class KartView {
  constructor(scene, info, options = {}) {
    this.scene = scene;
    this.id = info.id;
    const built = buildKartMesh(info, scene, options);
    this.group = built.group;
    this.wheels = built.wheels;
    this.flames = built.flames;
    this.label = built.label;
    this.isLocal = !!options.isLocal;
    this.baseScale = 1;
    if (this.label) this.label.visible = !!options.showLabel;
  }

  update(state, elapsed) {
    if (!this.group) return;
    this.group.position.set(state.x, 0, state.z);
    this.group.rotation.y = state.heading;
    this.group.rotation.z = -(state.steerVisual || 0) * 0.045;

    const steer = (state.steerVisual || 0) * 0.5;
    if (this.wheels) {
      this.wheels.fl.rotation.y = steer;
      this.wheels.fr.rotation.y = steer;
      this.wheels.fl.rotation.x = state.wheelSpin || 0;
      this.wheels.fr.rotation.x = state.wheelSpin || 0;
      this.wheels.rl.rotation.x = state.wheelSpin || 0;
      this.wheels.rr.rotation.x = state.wheelSpin || 0;
    }

    const active = state.turboState === 'active';
    for (const f of this.flames) {
      f.visible = active;
      if (active) {
        const pulse = 0.75 + Math.abs(Math.sin(elapsed * 42 + (this.id.length || 0))) * 0.6;
        f.scale.set(1, pulse * 1.5, 1);
        f.material.opacity = 0.65 + Math.sin(elapsed * 55) * 0.25;
      }
    }
    if (this.label) {
      this.label.visible = !this.isLocal;
    }
  }

  dispose() {
    if (!this.group) return;
    if (this.scene) this.scene.remove(this.group);
    this.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
        else o.material.dispose();
      }
    });
    this.group = null;
  }
}