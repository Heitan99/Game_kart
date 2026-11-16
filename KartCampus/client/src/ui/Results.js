/* =====================================================================
   KART CAMPUS — pantalla de resultados
   Presenta la clasificación final calculada por el servidor (online) o
   por la simulación local (individual).
   ===================================================================== */
import { formatTime } from '../core/Config.js';

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class Results {
  /**
   * @param {object} handlers { onAgain, onMenu }
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.el = {
      overlay: byId('overlay-results'),
      title: byId('results-title'),
      sub: byId('results-sub'),
      pos: byId('res-pos'),
      time: byId('res-time'),
      best: byId('res-best'),
      body: byId('res-body'),
      note: byId('res-note'),
      again: byId('btn-again'),
      menu: byId('btn-results-menu')
    };
    this.wire();
  }

  wire() {
    if (this.el.again) {
      this.el.again.addEventListener('click', () => this.handlers.onAgain && this.handlers.onAgain());
    }
    if (this.el.menu) {
      this.el.menu.addEventListener('click', () => this.handlers.onMenu && this.handlers.onMenu());
    }
  }

  show(on) {
    if (this.el.overlay) this.el.overlay.classList.toggle('on', !!on);
  }

  /**
   * @param {object} data
   *   results: [{position,name,colorHex,finished,finishTime,laps,bestLap,isHuman}]
   *   localId, mode: 'solo'|'online', canRestart
   */
  render(data) {
    const d = data || {};
    const results = d.results || [];
    const localId = d.localId;
    const me = results.find((r) => r.id === localId) || results[0] || null;

    if (this.el.pos) this.el.pos.textContent = me ? 'P' + me.position : '—';
    if (this.el.time) this.el.time.textContent = me && me.finished ? formatTime(me.finishTime) : '—';
    if (this.el.best) {
      this.el.best.textContent = me && me.bestLap ? formatTime(me.bestLap) : '--:--.---';
    }

    if (this.el.title) {
      if (me && me.finished && me.position === 1) {
        this.el.title.innerHTML = '¡VICTORIA EN <span>CAMPUS!</span>';
      } else if (me && me.finished) {
        this.el.title.innerHTML = 'CARRERA <span>COMPLETADA</span>';
      } else {
        this.el.title.innerHTML = 'CARRERA <span>FINALIZADA</span>';
      }
    }
    if (this.el.sub) {
      this.el.sub.textContent = (d.mode === 'online' ? 'Multijugador online' : 'Modo individual') + ' · 3 vueltas';
    }

    this.renderTable(results, localId);

    if (this.el.note) {
      this.el.note.textContent = d.mode === 'online'
        ? 'Posiciones, tiempos y vueltas validados por el servidor autoritativo.'
        : 'Clasificación calculada con la simulación local idéntica a la del servidor.';
    }

    if (this.el.again) {
      this.el.again.classList.toggle('hidden', d.canRestart === false);
    }
  }

  renderTable(results, localId) {
    const body = this.el.body;
    if (!body) return;
    body.innerHTML = '';
    for (const r of results) {
      const tr = document.createElement('tr');
      if (r.id === localId) tr.className = 'you';
      const color = '#' + (Number(r.colorHex) || 0xffffff).toString(16).padStart(6, '0');
      const status = r.finished
        ? '<span class="res-badge done">FINALIZADO</span>'
        : '<span class="res-badge run">EN CARRERA</span>';
      const time = r.finished ? formatTime(r.finishTime) : '—';
      tr.innerHTML =
        '<td class="mono">' + r.position + '</td>' +
        '<td><span class="dot" style="background:' + color + '"></span>' + escapeHtml(r.name) +
          (r.isHuman === false ? ' <span class="ai-tag">IA</span>' : '') + '</td>' +
        '<td>' + status + '</td>' +
        '<td class="mono">' + time + '</td>';
      body.appendChild(tr);
    }
  }
}
