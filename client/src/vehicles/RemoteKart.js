import { KartView } from './Kart.js';

export class RemoteKart {
  constructor(scene, info, interpolation) {
    this.id = info.id;
    this.interpolation = interpolation;
    this.view = new KartView(scene, info, { showLabel: true, isLocal: false });
  }

  update(elapsed) {
    const state = this.interpolation.sample(this.id);
    if (state) this.view.update(state, elapsed);
    return state;
  }

  dispose() {
    this.view.dispose();
  }
}