/* =====================================================================
   KART CAMPUS — entorno del campus
   Edificios, plaza, fuente, tribunas, árboles, farolas, señales y
   colinas. Todo procedural y con recuento adaptado a la calidad.
   ===================================================================== */
import { THREE } from './three.js';
import { CONFIG, mulberry32 } from '../core/Config.js';
import { isGrassArea } from '/shared/TrackGeometry.js';
import {
  makeWindowTexture, makeCrowdTexture, makeTextTexture, makeClockFaceTexture
} from './Textures.js';

const BUILDINGS = [
  { x: -122, z: 152, w: 42, d: 30, h: 30, wall: '#c7b9a4', roof: 0x54606e, name: 'INGENIERÍA', lit: 0.24, seed: 11, cols: 5, rows: 7 },
  { x: -40, z: 160, w: 52, d: 28, h: 36, wall: '#b9c4cc', roof: 0x44525f, name: 'AULAS  A', lit: 0.3, seed: 12, cols: 6, rows: 8 },
  { x: 58, z: 150, w: 46, d: 30, h: 26, wall: '#cbbfae', roof: 0x50606e, name: 'SISTEMAS', lit: 0.28, seed: 13, cols: 5, rows: 6 },
  { x: 128, z: 162, w: 34, d: 24, h: 22, wall: '#aebcc6', roof: 0x43505c, name: 'LABORATORIOS', lit: 0.22, seed: 14, cols: 4, rows: 5 },
  { x: -124, z: -152, w: 42, d: 28, h: 26, wall: '#c2b7a6', roof: 0x4d5a68, name: 'BIBLIOTECA', lit: 0.26, seed: 15, cols: 5, rows: 6 },
  { x: -24, z: -160, w: 54, d: 30, h: 32, wall: '#b6c3cd', roof: 0x44525f, name: 'RECTORADO', lit: 0.3, seed: 16, cols: 6, rows: 7 },
  { x: 82, z: -152, w: 44, d: 26, h: 24, wall: '#c9bda9', roof: 0x50606e, name: 'CAFETERÍA', lit: 0.34, seed: 17, cols: 5, rows: 5 },
  { x: 192, z: -32, w: 30, d: 42, h: 28, wall: '#bcc7d0', roof: 0x44525f, name: 'POSGRADOS', lit: 0.22, seed: 18, cols: 4, rows: 6 },
  { x: 196, z: 48, w: 28, d: 36, h: 20, wall: '#c8bcaa', roof: 0x50606e, name: 'AUDITORIO', lit: 0.3, seed: 19, cols: 4, rows: 4 },
  { x: -194, z: -28, w: 30, d: 40, h: 24, wall: '#c1c9d0', roof: 0x44525f, name: 'DEPORTES', lit: 0.24, seed: 20, cols: 4, rows: 5 },
  { x: -190, z: 52, w: 28, d: 34, h: 18, wall: '#c9bda9', roof: 0x50606e, name: 'CULTURA', lit: 0.28, seed: 21, cols: 4, rows: 4 },
  { x: 0, z: 54, w: 88, d: 30, h: 27, wall: '#d0c6b4', roof: 0x4b5866, name: 'BIBLIOTECA CENTRAL', lit: 0.3, seed: 22, cols: 7, rows: 6 },
  { x: 84, z: 26, w: 38, d: 26, h: 19, wall: '#c2ccd4', roof: 0x46545f, name: 'ING. DE SISTEMAS', lit: 0.3, seed: 23, cols: 4, rows: 4 },
  { x: -84, z: 26, w: 36, d: 24, h: 15, wall: '#cdc3b2', roof: 0x505e6a, name: 'CAFETERÍA', lit: 0.34, seed: 24, cols: 4, rows: 3 }
];

export class Environment {
  constructor(scene, track, quality, config = CONFIG) {
    this.scene = scene;
    this.track = track;
    this.quality = quality;
    this.config = config;
    this.occupied = [];
    this.build();
  }

  build() {
    const rng = mulberry32(9001);

    for (const b of BUILDINGS) {
      this.makeBuilding(b);
      this.occupied.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.62 });
    }

    this.makePlaza(0, -6, 30);
    this.makeFountain(0, -6);
    this.makeClockTower(-52, 18);
    this.makeGrandstand(24, -128, 0, 0x3ce8ff, 'SISTEMAS');
    this.makeGrandstand(-58, -128, 0, 0xff2e88, 'CAMPUS');

    const signs = [
      { x: 168, z: 118, text: 'CAMPUS\nUNIVERSITARIO', color: '#3ce8ff' },
      { x: -168, z: 118, text: 'INGENIERÍA\nDE SISTEMAS', color: '#b8ff45' },
      { x: 168, z: -118, text: 'META\n3 VUELTAS', color: '#ff2e88' },
      { x: -168, z: -118, text: 'ZONA\nDEPORTIVA', color: '#ffb340' }
    ];
    for (const s of signs) this.makeSign(s.x, s.z, s.text, s.color);

    const lampStep = 44;
    for (let s = 18; s < this.track.length; s += lampStep) {
      const sm = sample(this.track, s);
      const off = this.track.halfWidth + this.config.track.curbWidth + 2.6;
      this.makeLamp(sm.x + sm.nx * off, sm.z + sm.nz * off, Math.atan2(sm.nx, sm.nz));
    }

    const treeRng = mulberry32(5150);
    const treeTarget = this.quality.low ? 26 : 52;
    let trees = 0;
    for (let i = 0; i < 900 && trees < treeTarget; i++) {
      const x = -235 + treeRng() * 470;
      const z = -195 + treeRng() * 390;
      if (Math.hypot(x, z) < 34) continue;
      if (!isGrassArea(this.track, x, z, 7)) continue;
      let blocked = false;
      for (const o of this.occupied) {
        if (Math.hypot(x - o.x, z - o.z) < o.r + 9) { blocked = true; break; }
      }
      if (blocked) continue;
      if (Math.hypot(x, z + 6) < 46) continue;
      this.makeTree(x, z, 0.8 + treeRng() * 1.5, treeRng);
      trees++;
    }

    this.makeFlags(-14, -84);
    this.makeFlags(14, -84);
    this.makeHills();
  }

  makeBuilding(b) {
    const tex = makeWindowTexture(b.wall, b.lit, b.seed, b.cols, b.rows);
    const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0.04, color: 0xffffff });
    const roofMat = new THREE.MeshStandardMaterial({ color: b.roof, roughness: 0.9, metalness: 0.05 });
    const mats = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mats);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(b.w * 0.55, 2.2, b.d * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8a97a3, roughness: 0.8, metalness: 0.15 })
    );
    cap.position.set(b.x, b.h + 1.1, b.z);
    cap.castShadow = true;
    this.scene.add(cap);

    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.6, metalness: 0.5 })
    );
    ant.position.set(b.x + b.w * 0.18, b.h + 5, b.z);
    this.scene.add(ant);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b })
    );
    beacon.position.set(b.x + b.w * 0.18, b.h + 8.1, b.z);
    this.scene.add(beacon);

    const toCenterX = -b.x, toCenterZ = -b.z;
    let faceX, faceZ, faceRot;
    if (Math.abs(toCenterX) >= Math.abs(toCenterZ)) {
      const sgn = b.x > 0 ? -1 : 1;
      faceX = b.x + sgn * (b.w * 0.5 + 0.5);
      faceZ = b.z;
      faceRot = sgn < 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      const sgn = b.z > 0 ? -1 : 1;
      faceX = b.x;
      faceZ = b.z + sgn * (b.d * 0.5 + 0.5);
      faceRot = sgn < 0 ? Math.PI : 0;
    }

    const signMat = new THREE.MeshBasicMaterial({
      map: makeTextTexture(b.name, { w: 640, h: 128, bg: '#0d1a28', fg: '#eaf6ff', border: '#3ce8ff', size: 56 }),
      side: THREE.DoubleSide
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(b.w * 0.7, 20), 3.2), signMat);
    sign.position.set(faceX, b.h * 0.62, faceZ);
    sign.rotation.y = faceRot;
    this.scene.add(sign);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x25313d, roughness: 0.6, metalness: 0.2 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 1.2), doorMat);
    const doorOff = 0.75;
    door.position.set(faceX + Math.sin(faceRot) * doorOff, 2.5, faceZ + Math.cos(faceRot) * doorOff);
    door.rotation.y = faceRot;
    this.scene.add(door);
  }

  makeTree(x, z, scale, rng) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 3.4, 7), trunkMat);
    trunk.position.y = 1.7;
    trunk.castShadow = true;
    group.add(trunk);

    const pine = rng() < 0.45;
    const foliageMat = new THREE.MeshStandardMaterial({
      color: pine ? 0x2f6b3a : 0x4f8f3d, roughness: 0.92, flatShading: true
    });
    if (pine) {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.5 - i * 0.55, 2.8, 8), foliageMat);
        cone.position.y = 3.4 + i * 1.5;
        cone.castShadow = true;
        group.add(cone);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const s = 2.1 + rng() * 0.9;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(s, 9, 7), foliageMat);
        ball.position.set((rng() - 0.5) * 1.6, 4.1 + i * 1.15, (rng() - 0.5) * 1.6);
        ball.castShadow = true;
        group.add(ball);
      }
    }
    group.scale.setScalar(scale);
    this.scene.add(group);
  }

  makeLamp(x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b3540, roughness: 0.5, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 7.2, 8), metal);
    pole.position.y = 3.6;
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.3), metal);
    arm.position.set(0, 7.1, -1.05);
    group.add(arm);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe08a, emissiveIntensity: 1.4, roughness: 0.4 })
    );
    head.position.set(0, 7.0, -2.1);
    group.add(head);
    this.scene.add(group);
  }

  makeSign(x, z, text, color) {
    const group = new THREE.Group();
    const angle = Math.atan2(-x, -z);
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    const metal = new THREE.MeshStandardMaterial({ color: 0x27323d, roughness: 0.6, metalness: 0.4 });
    for (const sx of [-2.4, 2.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8, 7), metal);
      post.position.set(sx, 4, 0);
      post.castShadow = true;
      group.add(post);
    }
    const boardMat = new THREE.MeshStandardMaterial({
      map: makeTextTexture(text, { w: 512, h: 256, bg: '#0c1a28', fg: color, border: color, size: 54 }),
      side: THREE.DoubleSide, roughness: 0.7
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.7), boardMat);
    board.position.set(0, 6.2, 0);
    board.castShadow = true;
    group.add(board);
    this.scene.add(group);
  }

  makeGrandstand(x, z, rotY, color, label) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;

    const crowdMat = new THREE.MeshStandardMaterial({ map: makeCrowdTexture(), roughness: 0.9 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa6b0, roughness: 0.9 });
    const L = 54;
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const geo = new THREE.BoxGeometry(L, 1.5, 3.4);
      const mats = [concrete, concrete, crowdMat, concrete, concrete, concrete];
      const tier = new THREE.Mesh(geo, mats);
      tier.position.set(0, 1.0 + t * 1.45, -t * 3.4);
      tier.castShadow = true;
      tier.receiveShadow = true;
      group.add(tier);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(L, 9, 1.2), concrete);
    back.position.set(0, 4.5, -tiers * 3.4 - 0.6);
    back.castShadow = true;
    group.add(back);

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b4a58, roughness: 0.7, metalness: 0.3 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.6, 18), roofMat);
    roof.position.set(0, 10.6, -5.5);
    roof.castShadow = true;
    group.add(roof);
    for (const sx of [-L / 2 + 3, L / 2 - 3]) {
      for (const sz of [0.5, -12]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 10.6, 7), roofMat);
        pole.position.set(sx, 5.3, sz);
        group.add(pole);
      }
    }
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(L + 2, 1.3, 0.4),
      new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5 })
    );
    band.position.set(0, 8.9, 0.2);
    group.add(band);

    const signMat = new THREE.MeshBasicMaterial({
      map: makeTextTexture(label, { w: 512, h: 96, bg: '#0d1a28', fg: '#eaf6ff', size: 52 }),
      side: THREE.DoubleSide
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), signMat);
    sign.position.set(0, 7.3, 0.24);
    group.add(sign);
    this.scene.add(group);
  }

  makePlaza(x, z, radius) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.95 });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.24, 48), mat);
    plaza.position.set(x, 0.06, z);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.82, 0.32, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.7, metalness: 0.2 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.2, z);
    this.scene.add(ring);
  }

  makeFountain(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0xb9b0a0, roughness: 0.9 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.2, 1.4, 40), stone);
    basin.position.y = 0.7;
    basin.castShadow = true;
    basin.receiveShadow = true;
    group.add(basin);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f8fca, transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.2
    });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(7.7, 7.7, 0.35, 40), waterMat);
    water.position.y = 1.35;
    group.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 5.2, 14), stone);
    column.position.y = 3.6;
    column.castShadow = true;
    group.add(column);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 1.4, 0.7, 20), stone);
    bowl.position.y = 6.1;
    bowl.castShadow = true;
    group.add(bowl);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), waterMat);
    top.position.y = 6.9;
    group.add(top);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.14, 2.2, 5),
        new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: 0.7 })
      );
      jet.position.set(Math.cos(a) * 2.1, 7.2, Math.sin(a) * 2.1);
      jet.rotation.z = Math.cos(a) * 0.35;
      jet.rotation.x = -Math.sin(a) * 0.35;
      group.add(jet);
    }
    this.scene.add(group);
  }

  makeClockTower(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc7b89f, roughness: 0.9 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 24, 8), bodyMat);
    tower.position.y = 12;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    const clockMat = new THREE.MeshStandardMaterial({ map: makeClockFaceTexture(), roughness: 0.6 });
    const plainMat = new THREE.MeshStandardMaterial({ color: 0xb3a58d, roughness: 0.9 });
    const mats = [clockMat, clockMat, plainMat, plainMat, clockMat, clockMat];
    const clockBox = new THREE.Mesh(new THREE.BoxGeometry(6.2, 6.2, 6.2), mats);
    clockBox.position.y = 24.6;
    group.add(clockBox);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(5.6, 5.4, 4),
      new THREE.MeshStandardMaterial({ color: 0x3f5566, roughness: 0.7, metalness: 0.3 })
    );
    roof.position.y = 30.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x2d3a45, metalness: 0.6, roughness: 0.4 })
    );
    spire.position.y = 34.4;
    group.add(spire);

    this.scene.add(group);
  }

  makeFlags(x, z) {
    const colors = [0x3ce8ff, 0xff2e88, 0xb8ff45, 0xffb340];
    for (let i = 0; i < 4; i++) {
      const px = x + (i % 2) * 3.4 - 1.7;
      const pz = z + Math.floor(i / 2) * 3.4 - 1.7;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 6.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x54606c, metalness: 0.5, roughness: 0.5 })
      );
      pole.position.set(px, 3.25, pz);
      this.scene.add(pole);
      const flagMat = new THREE.MeshStandardMaterial({
        color: colors[i], side: THREE.DoubleSide, roughness: 0.7,
        emissive: colors[i], emissiveIntensity: 0.15
      });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), flagMat);
      flag.position.set(px + 1.25, 5.5, pz);
      this.scene.add(flag);
    }
  }

  makeHills() {
    const rng = mulberry32(313);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c7a55, roughness: 1.0, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng() * 0.2;
      const rad = 820 + rng() * 320;
      const h = 120 + rng() * 160;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(240 + rng() * 150, h, 6), mat);
      cone.position.set(Math.cos(a) * rad, h / 2 - 18, Math.sin(a) * rad);
      cone.rotation.y = rng() * Math.PI;
      this.scene.add(cone);
    }
  }
}

function sample(track, s) {
  const L = track.length;
  s = ((s % L) + L) % L;
  let lo = 0, hi = track.pts.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (track.cumDist[mid] <= s) lo = mid; else hi = mid;
  }
  if (lo >= track.pts.length) lo = track.pts.length - 1;
  const t = Math.min(1, Math.max(0, (s - track.cumDist[lo]) / (track.segLen[lo] || 1)));
  const a = track.pts[lo];
  const b = track.pts[(lo + 1) % track.pts.length];
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    nx: track.normals[lo].x, nz: track.normals[lo].z
  };
}