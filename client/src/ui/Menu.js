function byId(id) {
  return document.getElementById(id);
}

export class Menu {
  /**
   * @param {object} handlers
   *  - onSolo(name)
   *  - onOnline(name)
   *  - onAnyKey()
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.el = {
      overlay: byId('overlay-menu'),
      name: byId('player-name'),
      btnSolo: byId('btn-solo'),
      btnOnline: byId('btn-online'),
      btnHow: byId('btn-how'),
      howPanel: byId('how-panel'),
      modeNote: byId('online-note')
    };
    this.name = loadName();
    this.wire();
    if (this.el.name) this.el.name.value = this.name;
  }

  wire() {
    const el = this.el;
    if (el.name) {
      el.name.addEventListener('input', () => {
        this.name = el.name.value;
      });
      el.name.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') this.emitSolo();
      });
    }
    if (el.btnSolo) el.btnSolo.addEventListener('click', () => this.emitSolo());
    if (el.btnOnline) el.btnOnline.addEventListener('click', () => this.emitOnline());
    if (el.btnHow) {
      el.btnHow.addEventListener('click', () => {
        if (el.howPanel) el.howPanel.classList.toggle('collapsed');
      });
    }
  }

  /** Nombre saneado y con valor por defecto. */
  currentName() {
    const raw = (this.name || '').trim().replace(/[<>"'`\\/]/g, '').replace(/\s+/g, ' ');
    const name = raw.slice(0, 16);
    if (name.length < 2) return 'PILOTO';
    return name;
  }

  emitSolo() {
    saveName(this.currentName());
    if (this.handlers.onAnyKey) this.handlers.onAnyKey();
    if (this.handlers.onSolo) this.handlers.onSolo(this.currentName());
  }

  emitOnline() {
    saveName(this.currentName());
    if (this.handlers.onAnyKey) this.handlers.onAnyKey();
    if (this.handlers.onOnline) this.handlers.onOnline(this.currentName());
  }

  show(on) {
    if (this.el.overlay) this.el.overlay.classList.toggle('on', !!on);
  }

  /** Muestra un aviso breve en el menú (p. ej. error de conexión). */
  setNote(text) {
    if (this.el.modeNote) this.el.modeNote.textContent = text || '';
  }
}

function loadName() {
  try {
    return window.localStorage.getItem('kc_name') || '';
  } catch (e) {
    return '';
  }
}

function saveName(name) {
  try {
    window.localStorage.setItem('kc_name', name);
  } catch (e) {
    /* modo privado: se ignora */
  }
}
