/* =====================================================================
   KART CAMPUS — checkpoints
   Fachada local sobre la validación de puertas compartida. Se usa en el
   modo individual; en online la autoridad es siempre el servidor.
   ===================================================================== */
import { CONFIG } from '../core/Config.js';
import { checkGates, onGateCrossed } from '/shared/RaceRules.js';

export class Checkpoints {
  constructor(track, config = CONFIG) {
    this.track = track;
    this.config = config;
  }

  /**
   * Comprueba el cruce de puertas de un kart entre dos pasos.
   * @param {object} kart
   * @param {number} px posición X previa
   * @param {number} pz posición Z previa
   * @param {object} race estado de carrera (time, finishCount)
   */
  check(kart, px, pz, race) {
    return checkGates(kart, this.track.data, px, pz, kart.x, kart.z, race, this.config);
  }

  /** Aplica manualmente el cruce de una puerta (uso en pruebas). */
  cross(kart, gate, race) {
    return onGateCrossed(kart, gate, race, this.config);
  }

  /** Etiqueta legible del siguiente control. */
  label(nextGate) {
    if (nextGate === 0) return 'META';
    return 'CONTROL ' + nextGate + ' / ' + this.config.race.checkpoints;
  }

  /** Color de la puerta resaltada (coincide con TrackView.GATE_COLORS). */
  static gateColors() {
    return [0xffffff, 0x3ce8ff, 0xff2e88, 0xb8ff45, 0xffb340];
  }
}
