/* =====================================================================
   KART CAMPUS — movimiento (fachada del módulo compartido)
   El cliente usa exactamente la misma física que el servidor.
   ===================================================================== */
export {
  makeKartState,
  placeKartOnGrid,
  applyPhysics,
  updateTurboState,
  computeAIInput
} from '/shared/Physics.js';

export {
  stepRace,
  computeStandings,
  updateKartProgress,
  checkGates,
  onGateCrossed
} from '/shared/RaceRules.js';

export { CONFIG } from '/shared/GameConfig.js';