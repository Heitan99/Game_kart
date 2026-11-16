/* =====================================================================
   KART CAMPUS — circuito
   Envuelve la geometría compartida del circuito y ofrece utilidades de
   muestreo/proyección al resto del cliente.
   ===================================================================== */
import { CONFIG } from '../core/Config.js';
import {
  createTrackData, sampleTrackAtS, projectToTrack, isGrassArea
} from '/shared/TrackGeometry.js';

export class Track {
  constructor(config = CONFIG) {
    this.config = config;
    this.data = createTrackData(config);
  }

  get length() { return this.data.length; }
  get halfWidth() { return this.data.halfWidth; }
  get gates() { return this.data.gates; }
  get pts() { return this.data.pts; }
  get bounds() { return this.data.bounds; }

  /** Punto del eje por distancia de arco. */
  sample(s) {
    return sampleTrackAtS(this.data, s);
  }

  /** Proyección de un punto al eje con pista de búsqueda opcional. */
  project(x, z, hint) {
    return projectToTrack(this.data, x, z, hint);
  }

  /** ¿Está el punto sobre el césped (fuera del asfalto + margen)? */
  onGrass(x, z, margin) {
    return isGrassArea(this.data, x, z, margin);
  }

  /** Posición de parrilla para un slot. */
  gridSlot(slot) {
    const g = this.config.race.grid[slot % this.config.race.grid.length];
    const sm = sampleTrackAtS(this.data, this.length - g.back);
    return {
      x: sm.x + sm.nx * g.lateral,
      z: sm.z + sm.nz * g.lateral,
      heading: Math.atan2(sm.tx, sm.tz)
    };
  }
}
