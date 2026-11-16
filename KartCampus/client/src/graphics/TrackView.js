/* =====================================================================
   KART CAMPUS — malla de la pista y puertas
   ===================================================================== */
import { THREE } from './three.js';
import { CONFIG } from '../core/Config.js';
import {
  makeAsphaltTexture, makeGrassTexture, makeCurbTexture,
  makeCheckerTexture, makeDashTexture, makeTextTexture, makeNumberTexture
} from './Textures.js';

export const GATE_COLORS = [0xffffff, 0x3ce8ff, 0xff2e88, 0xb8ff45, 0xffb340];

export class TrackView {
  constructor(scene, track, config = CONFIG) {
    this.scene = scene;
    this.track = track;
    this.config = config;
    this.gateGroups = [];
    this.build();
  }

  buildRibbonGeometry(offA, offB, y, alongRepeat, curbStyle) {
    const track = this.track;
    const pts = track.pts;
    const n = pts.length;
    const positions = new Float32Array(n * 6);
    const normalsArr = new Float32Array(n * 6);
    const uvs = new Float32Array(n * 4);
    const indices = new Uint32Array(n * 6);

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const nrm = track.normals[i];
      const ax = p.x + nrm.x * offA, az = p.z + nrm.z * offA;
      const bx = p.x + nrm.x * offB, bz = p.z + nrm.z * offB;
      const o = i * 6;
      positions[o] = ax; positions[o + 1] = y; positions[o + 2] = az;
      positions[o + 3] = bx; positions[o + 4] = y; positions[o + 5] = bz;
      normalsArr[o] = 0; normalsArr[o + 1] = 1; normalsArr[o + 2] = 0;
      normalsArr[o + 3] = 0; normalsArr[o + 4] = 1; normalsArr[o + 5] = 0;

      const d = track.cumDist[i];
      const u = i * 4;
      if (curbStyle) {
        uvs[u] = d * alongRepeat; uvs[u + 1] = 0;
        uvs[u + 2] = d * alongRepeat; uvs[u + 3] = 1;
      } else {
        uvs[u] = 0; uvs[u + 1] = d * alongRepeat;
        uvs[u + 2] = 1; uvs[u + 3] = d * alongRepeat;
      }
    }

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
      const o = i * 6;
      indices[o] = a; indices[o + 1] = c; indices[o + 2] = b;
      indices[o + 3] = b; indices[o + 4] = c; indices[o + 5] = d;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normalsArr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  makeQuadGeometry(corners, uvCorners) {
    const positions = new Float32Array(12);
    const normalsArr = new Float32Array(12);
    const uvs = new Float32Array(8);
    for (let i = 0; i < 4; i++) {
      positions[i * 3] = corners[i].x;
      positions[i * 3 + 1] = corners[i].y;
      positions[i * 3 + 2] = corners[i].z;
      normalsArr[i * 3] = 0; normalsArr[i * 3 + 1] = 1; normalsArr[i * 3 + 2] = 0;
      uvs[i * 2] = uvCorners[i].u;
      uvs[i * 2 + 1] = uvCorners[i].v;
    }
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normalsArr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  build() {
    const track = this.track;
    const hw = track.halfWidth;
    const curbW = this.config.track.curbWidth;

    // Césped base
    const grassGeo = new THREE.PlaneGeometry(1900, 1900, 1, 1);
    const grassMat = new THREE.MeshStandardMaterial({
      map: makeGrassTexture(), roughness: 0.98, metalness: 0.0, color: 0xffffff
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.03;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Asfalto
    const roadGeo = this.buildRibbonGeometry(-hw, hw, 0.02, 1 / 9, false);
    const roadMat = new THREE.MeshStandardMaterial({
      map: makeAsphaltTexture(), roughness: 0.95, metalness: 0.02, color: 0xffffff,
      side: THREE.DoubleSide
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    this.scene.add(road);

    // Bordillos rojo/blanco
    const curbGeoR = this.buildRibbonGeometry(-hw - curbW, -hw, 0.035, 1 / 3.4, true);
    const curbGeoL = this.buildRibbonGeometry(hw, hw + curbW, 0.035, 1 / 3.4, true);
    const curbMat = new THREE.MeshStandardMaterial({
      map: makeCurbTexture(), roughness: 0.7, metalness: 0.0, color: 0xffffff,
      side: THREE.DoubleSide
    });
    const curbR = new THREE.Mesh(curbGeoR, curbMat);
    const curbL = new THREE.Mesh(curbGeoL, curbMat);
    curbR.receiveShadow = true; curbL.receiveShadow = true;
    this.scene.add(curbR, curbL);

    // Línea central discontinua
    const dashGeo = this.buildRibbonGeometry(-0.16, 0.16, 0.045, 1 / 7, false);
    const dashMat = new THREE.MeshBasicMaterial({
      map: makeDashTexture(), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide
    });
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.renderOrder = 2;
    this.scene.add(dash);

    // Línea de meta a cuadros
    const g0 = track.gates[0];
    const halfD = this.config.track.startLineDepth * 0.5;
    const corners = [
      { x: g0.x + g0.nx * hw - g0.tx * halfD, y: 0.06, z: g0.z + g0.nz * hw - g0.tz * halfD },
      { x: g0.x - g0.nx * hw - g0.tx * halfD, y: 0.06, z: g0.z - g0.nz * hw - g0.tz * halfD },
      { x: g0.x - g0.nx * hw + g0.tx * halfD, y: 0.06, z: g0.z - g0.nz * hw + g0.tz * halfD },
      { x: g0.x + g0.nx * hw + g0.tx * halfD, y: 0.06, z: g0.z + g0.nz * hw + g0.tz * halfD }
    ];
    const quads = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }];
    const startGeo = this.makeQuadGeometry(corners, quads);
    const startMat = new THREE.MeshStandardMaterial({
      map: makeCheckerTexture(), roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide
    });
    startMat.map.repeat.set(9, 1.6);
    const startLine = new THREE.Mesh(startGeo, startMat);
    startLine.receiveShadow = true;
    startLine.renderOrder = 1;
    this.scene.add(startLine);

    this.buildGates();
  }

  makeGateGroup(gate, isFinish) {
    const hw = this.track.halfWidth;
    const group = new THREE.Group();
    const postOffset = hw + 1.35;
    const postH = isFinish ? 6.6 : 5.6;
    const color = GATE_COLORS[gate.index];

    const postMat = new THREE.MeshStandardMaterial({
      color: isFinish ? 0xdfe7ee : 0x2b3a4c, roughness: 0.55, metalness: 0.35
    });
    const postGeo = new THREE.CylinderGeometry(0.26, 0.32, postH, 10);
    const pL = new THREE.Mesh(postGeo, postMat);
    pL.position.set(-postOffset, postH / 2, 0);
    pL.castShadow = true;
    const pR = new THREE.Mesh(postGeo, postMat);
    pR.position.set(postOffset, postH / 2, 0);
    pR.castShadow = true;
    group.add(pL, pR);

    const beamLen = postOffset * 2;
    const beamGeo = new THREE.BoxGeometry(beamLen, isFinish ? 1.5 : 0.42, 0.5);
    const beamMat = new THREE.MeshStandardMaterial({
      color: isFinish ? 0x1b2735 : 0x233140, roughness: 0.5, metalness: 0.4
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = postH;
    beam.castShadow = true;
    group.add(beam);

    if (isFinish) {
      const bannerMat = new THREE.MeshBasicMaterial({
        map: makeTextTexture('KART CAMPUS', { w: 1024, h: 160, bg: '#101a28', fg: '#eaf6ff', border: '#3ce8ff', size: 92 }),
        side: THREE.DoubleSide
      });
      const bannerGeo = new THREE.PlaneGeometry(beamLen * 0.92, 1.34);
      const bannerFront = new THREE.Mesh(bannerGeo, bannerMat);
      bannerFront.position.set(0, postH, 0.34);
      group.add(bannerFront);
      const bannerBack = new THREE.Mesh(bannerGeo, bannerMat);
      bannerBack.position.set(0, postH, -0.34);
      bannerBack.rotation.y = Math.PI;
      group.add(bannerBack);
      for (let i = 0; i < 10; i++) {
        const fMat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x3ce8ff : 0xff2e88, side: THREE.DoubleSide
        });
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 4), fMat);
        f.position.set(-beamLen * 0.45 + i * (beamLen * 0.9 / 9), postH - 1.0, 0.34);
        f.rotation.z = Math.PI;
        group.add(f);
      }
    } else {
      const curtainMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(beamLen * 0.94, 4.7), curtainMat);
      curtain.position.y = 2.55;
      group.add(curtain);

      const labelMat = new THREE.MeshBasicMaterial({
        map: makeNumberTexture(gate.cpIndex, '#' + color.toString(16).padStart(6, '0')),
        transparent: true, side: THREE.DoubleSide, depthWrite: false
      });
      const labelGeo = new THREE.PlaneGeometry(1.5, 1.5);
      const labelFront = new THREE.Mesh(labelGeo, labelMat);
      labelFront.position.set(0, postH + 0.55, 0.14);
      group.add(labelFront);
      const labelBack = new THREE.Mesh(labelGeo, labelMat);
      labelBack.position.set(0, postH + 0.55, -0.14);
      labelBack.rotation.y = Math.PI;
      group.add(labelBack);

      gate._curtain = curtain;
    }

    group.position.set(gate.x, 0, gate.z);
    group.rotation.y = Math.atan2(gate.tx, gate.tz);
    this.scene.add(group);
    return { group: group, color: color, isFinish: isFinish, curtain: gate._curtain || null };
  }

  buildGates() {
    for (const gate of this.track.gates) {
      gate.visual = this.makeGateGroup(gate, gate.isFinish);
    }
  }

  /** Resalta el siguiente checkpoint del jugador local. */
  update(nextGate, racing, elapsed) {
    for (const gate of this.track.gates) {
      if (!gate.visual || gate.isFinish || !gate.visual.curtain) continue;
      const curtain = gate.visual.curtain;
      const isNext = racing && nextGate === gate.cpIndex;
      if (isNext) {
        curtain.material.color.setHex(0xb8ff45);
        curtain.material.opacity = 0.22 + Math.sin(elapsed * 5) * 0.09;
      } else {
        curtain.material.color.setHex(gate.visual.color);
        curtain.material.opacity = 0.12;
      }
    }
  }
}