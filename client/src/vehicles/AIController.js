import { computeAIInput } from '../../../shared/Physics.js';

export class AIController {
  constructor(config) {
    this.config = config;
  }

  /** Calcula y aplica la entrada de un kart IA. */
  update(kart, track, dt, racing) {
    computeAIInput(kart, track, dt, racing, this.config);
  }
}