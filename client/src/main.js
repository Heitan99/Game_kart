import { Game } from './core/Game.js';

function boot() {
  const bootMsg = document.getElementById('boot-msg');
  try {
    const game = new Game();
    game.start();
    window.KART_CAMPUS = game;
  } catch (err) {
    console.error('[KART CAMPUS] Error al iniciar:', err);
    if (bootMsg) {
      bootMsg.textContent = 'ERROR: ' + (err && err.message ? err.message : 'desconocido');
      bootMsg.style.color = '#ff6a8a';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
