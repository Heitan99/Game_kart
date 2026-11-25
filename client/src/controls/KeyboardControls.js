export class KeyboardControls {
  constructor(options = {}) {
    this.keys = Object.create(null);
    this.state = { throttle: 0, brake: 0, steer: 0 };
    this.turboLatch = false;
    this.onPause = options.onPause || null;
    this.onEnter = options.onEnter || null;
    this.onAnyKey = options.onAnyKey || null;
    this.enabled = true;
    this._down = this.onKeyDown.bind(this);
    this._up = this.onKeyUp.bind(this);
    this._blur = this.clear.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    return this;
  }

  detach() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }

  onKeyDown(e) {
    if (!this.enabled) return;
    const key = e.key ? e.key.toLowerCase() : '';
    if (key === ' ' || key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
      e.preventDefault();
    }
    if (!this.keys[key]) {
      if (key === ' ') this.turboLatch = true;
      if ((key === 'p' || key === 'escape') && !e.repeat && this.onPause) this.onPause();
      if (key === 'enter' && !e.repeat && this.onEnter) this.onEnter();
      if (this.onAnyKey) this.onAnyKey();
    }
    this.keys[key] = true;
  }

  onKeyUp(e) {
    const key = e.key ? e.key.toLowerCase() : '';
    this.keys[key] = false;
  }

  clear() {
    for (const k in this.keys) this.keys[k] = false;
    this.turboLatch = false;
    this.state.throttle = 0;
    this.state.brake = 0;
    this.state.steer = 0;
  }

  read() {
    const up = this.keys['w'] || this.keys['arrowup'];
    const down = this.keys['s'] || this.keys['arrowdown'];
    const left = this.keys['a'] || this.keys['arrowleft'];
    const right = this.keys['d'] || this.keys['arrowright'];
    this.state.throttle = up ? 1 : 0;
    this.state.brake = down ? 1 : 0;
    // Convención de la física compartida: steer positivo gira a la IZQUIERDA.
    // La cámara mira en +forward, así que este signo hace que "A/←" gire a la
    // izquierda y "D/→" a la derecha en pantalla.
    this.state.steer = (left ? 1 : 0) - (right ? 1 : 0);
    return this.state;
  }

  consumeTurbo() {
    const t = this.turboLatch;
    this.turboLatch = false;
    return t;
  }
}