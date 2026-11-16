/* =====================================================================
   KART CAMPUS — controles táctiles
   Pointer Events con seguimiento por puntero: permite mantener varios
   botones a la vez (acelerar + girar + turbo) en móviles.
   ===================================================================== */
export class TouchControls {
  constructor(options = {}) {
    this.state = { throttle: 0, brake: 0, steer: 0 };
    this.turboLatch = false;
    this.active = new Map();       // pointerId → acción
    this.buttons = new Map();      // acción → elemento
    this.enabled = true;
    this.visible = false;
    this.onPause = options.onPause || null;
    this.onAnyKey = options.onAnyKey || null;
    this.container = null;
    this._bind = this._bind.bind(this);
  }

  mount(root) {
    this.container = root;
    if (!root) return this;
    root.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.getAttribute('data-action');
      this.buttons.set(action, btn);
      btn.addEventListener('pointerdown', (e) => this._down(e, action, btn));
      // No se libera en 'lostpointercapture': algunos navegadores lo disparan
      // a mitad de una pulsación (por ejemplo al apoyar un segundo dedo) y
      // soltaría el acelerador, parando el kart sin querer. La liberación se
      // hace con pointerup/pointercancel global, que siempre identifica el
      // puntero correcto aunque el dedo termine fuera del botón.
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    if (!this._globalUp) {
      this._globalUp = (e) => this._up(e);
      document.addEventListener('pointerup', this._globalUp);
      document.addEventListener('pointercancel', this._globalUp);
    }
    this._bind();
    return this;
  }

  detach() {
    if (this._globalUp && typeof document !== 'undefined') {
      document.removeEventListener('pointerup', this._globalUp);
      document.removeEventListener('pointercancel', this._globalUp);
      this._globalUp = null;
    }
  }

  _bind() {
    if (this.container) {
      this.container.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    }
  }

  _down(e, action, btn) {
    if (!this.enabled) return;
    e.preventDefault();
    try { if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (btn.classList) btn.classList.add('pressed');
    this.applyPointer(e.pointerId, action);
    if (this.onAnyKey) this.onAnyKey();
  }

  /** Registra un puntero sobre una acción (independiente del DOM, testeable). */
  applyPointer(pointerId, action) {
    this.active.set(pointerId, action);
    if (action === 'turbo') this.turboLatch = true;
    if (action === 'pause' && this.onPause) this.onPause();
    this._recompute();
  }

  id(e) {
    return e.pointerId;
  }

  _up(e) {
    const action = this.active.get(e.pointerId);
    if (action === undefined) return;
    const btn = this.buttons.get(action);
    if (btn && btn.classList) btn.classList.remove('pressed');
    this.releasePointer(e.pointerId);
  }

  /** Libera un puntero (independiente del DOM, testeable). */
  releasePointer(pointerId) {
    const action = this.active.get(pointerId);
    if (action === undefined) return;
    this.active.delete(pointerId);
    this._recompute();
  }

  _recompute() {
    let accel = false, brake = false, left = false, right = false;
    for (const action of this.active.values()) {
      if (action === 'accel') accel = true;
      else if (action === 'brake') brake = true;
      else if (action === 'left') left = true;
      else if (action === 'right') right = true;
    }
    this.state.throttle = accel ? 1 : 0;
    this.state.brake = brake ? 1 : 0;
    // Misma convención que la física compartida: positivo = izquierda.
    this.state.steer = (left ? 1 : 0) - (right ? 1 : 0);
  }

  show(on) {
    this.visible = !!on;
    if (this.container) this.container.classList.toggle('on', !!on);
    if (!on) this.clear();
  }

  clear() {
    this.active.clear();
    for (const btn of this.buttons.values()) btn.classList.remove('pressed');
    this.state.throttle = 0;
    this.state.brake = 0;
    this.state.steer = 0;
    this.turboLatch = false;
  }

  consumeTurbo() {
    const t = this.turboLatch;
    this.turboLatch = false;
    return t;
  }

  read() {
    return this.state;
  }
}