/* =====================================================================
   KART CAMPUS — lobby multijugador
   Pantalla de salas: crear/unión por código, lista de salas públicas,
   lista de jugadores con estado listo y control del anfitrión.
   ===================================================================== */

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class Lobby {
  /**
   * @param {object} handlers
   *  - onCreate({ name, isPublic, aiCount })
   *  - onJoin({ code, name })
   *  - onLeave()
   *  - onReady(ready)
   *  - onStart()
   *  - onAI(count)
   *  - onCopyCode(code)
   *  - onRefresh()
   *  - onAnyKey()
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.el = {
      overlay: byId('overlay-lobby'),
      name: byId('player-name'),
      createPublic: byId('create-public'),
      aiCount: byId('ai-count'),
      aiValue: byId('ai-count-value'),
      btnCreate: byId('btn-create-room'),
      joinCode: byId('join-code'),
      btnJoin: byId('btn-join-room'),
      btnRefresh: byId('btn-refresh-rooms'),
      publicRooms: byId('public-rooms'),
      roomPanel: byId('room-panel'),
      roomCode: byId('room-code'),
      btnCopy: byId('btn-copy-code'),
      roomPlayers: byId('room-players'),
      btnReady: byId('btn-ready'),
      btnStart: byId('btn-start-race'),
      btnLeave: byId('btn-leave-room'),
      aiRow: byId('ai-row'),
      aiLobby: byId('ai-lobby'),
      aiLobbyValue: byId('ai-lobby-value'),
      status: byId('lobby-status')
    };
    this.room = null;
    this.playerId = null;
    this.ready = false;
    this.wire();
  }

  wire() {
    const el = this.el;
    if (el.btnCreate) {
      el.btnCreate.addEventListener('click', () => {
        if (this.handlers.onAnyKey) this.handlers.onAnyKey();
        const aiCount = el.aiCount ? Number(el.aiCount.value) || 0 : 0;
        this.handlers.onCreate && this.handlers.onCreate({
          name: this.name(),
          isPublic: el.createPublic ? el.createPublic.checked : true,
          aiCount: aiCount
        });
      });
    }
    if (el.aiCount) {
      el.aiCount.addEventListener('input', () => {
        if (el.aiValue) el.aiValue.textContent = String(el.aiCount.value);
      });
    }
    if (el.btnJoin) {
      el.btnJoin.addEventListener('click', () => this.joinFromInput());
    }
    if (el.joinCode) {
      el.joinCode.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') this.joinFromInput();
      });
      el.joinCode.addEventListener('input', () => {
        el.joinCode.value = el.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      });
    }
    if (el.btnRefresh) {
      el.btnRefresh.addEventListener('click', () => this.handlers.onRefresh && this.handlers.onRefresh());
    }
    if (el.btnCopy) {
      el.btnCopy.addEventListener('click', () => {
        if (this.room && this.handlers.onCopyCode) this.handlers.onCopyCode(this.room.code);
      });
    }
    if (el.btnReady) {
      el.btnReady.addEventListener('click', () => {
        this.ready = !this.ready;
        this.handlers.onReady && this.handlers.onReady(this.ready);
        this.renderReady();
      });
    }
    if (el.btnStart) {
      el.btnStart.addEventListener('click', () => this.handlers.onStart && this.handlers.onStart());
    }
    if (el.btnLeave) {
      el.btnLeave.addEventListener('click', () => this.handlers.onLeave && this.handlers.onLeave());
    }
    if (el.aiLobby) {
      el.aiLobby.addEventListener('input', () => {
        const v = Number(el.aiLobby.value) || 0;
        if (el.aiLobbyValue) el.aiLobbyValue.textContent = String(v);
      });
      el.aiLobby.addEventListener('change', () => {
        this.handlers.onAI && this.handlers.onAI(Number(el.aiLobby.value) || 0);
      });
    }
  }

  name() {
    const input = this.el.name;
    const raw = input ? input.value : '';
    const clean = String(raw || '').trim().replace(/[<>"'`\\/]/g, '').replace(/\s+/g, ' ').slice(0, 16);
    return clean.length >= 2 ? clean : 'PILOTO';
  }

  joinFromInput() {
    if (this.handlers.onAnyKey) this.handlers.onAnyKey();
    const code = this.el.joinCode ? this.el.joinCode.value.trim() : '';
    if (!code) {
      this.setStatus('Escribe un código de sala válido', true);
      return;
    }
    this.handlers.onJoin && this.handlers.onJoin({ code: code, name: this.name() });
  }

  show(on) {
    if (this.el.overlay) this.el.overlay.classList.toggle('on', !!on);
  }

  setStatus(text, isError) {
    if (!this.el.status) return;
    this.el.status.textContent = text || '';
    this.el.status.classList.toggle('error', !!isError);
  }

  /** Actualiza la lista de salas públicas. */
  setPublicRooms(rooms) {
    const box = this.el.publicRooms;
    if (!box) return;
    if (!rooms || rooms.length === 0) {
      box.innerHTML = '<div class="room-empty">No hay salas públicas. Crea una o únete con un código.</div>';
      return;
    }
    box.innerHTML = '';
    for (const room of rooms) {
      const row = document.createElement('div');
      row.className = 'room-item';
      const count = room.players.filter((p) => p.connected).length;
      row.innerHTML =
        '<div class="room-item-main">' +
          '<span class="room-item-code mono">' + escapeHtml(room.code) + '</span>' +
          '<span class="room-item-info">' + count + '/' + room.maxPlayers +
            (room.aiCount > 0 ? ' · +' + room.aiCount + ' IA' : '') + '</span>' +
        '</div>' +
        '<button class="btn small" type="button">UNIRSE</button>';
      const btn = row.querySelector('button');
      btn.addEventListener('click', () => {
        this.handlers.onAnyKey && this.handlers.onAnyKey();
        this.handlers.onJoin && this.handlers.onJoin({ code: room.code, name: this.name() });
      });
      row.querySelector('.room-item-main').addEventListener('click', () => {
        if (this.el.joinCode) this.el.joinCode.value = room.code;
      });
      box.appendChild(row);
    }
  }

  /** Refresca el panel interno una vez dentro de una sala. */
  setRoom(room, playerId) {
    this.room = room;
    this.playerId = playerId;

    const inRoom = !!room;
    if (this.el.roomPanel) this.el.roomPanel.classList.toggle('hidden', !inRoom);

    // Tarjetas de creación/unión y lista pública se ocultan al estar en sala.
    const createCard = byId('create-card');
    if (createCard) createCard.classList.toggle('hidden', inRoom);
    const joinCard = byId('join-card');
    if (joinCard) joinCard.classList.toggle('hidden', inRoom);
    const listCard = byId('rooms-card');
    if (listCard) listCard.classList.toggle('hidden', inRoom);

    if (!inRoom) {
      this.ready = false;
      this.renderReady();
      return;
    }

    if (this.el.roomCode) this.el.roomCode.textContent = room.code;

    const me = room.players.find((p) => p.id === playerId);
    const isHost = room.hostId === playerId;
    this.ready = me ? !!me.ready : false;
    this.renderReady();

    if (this.el.aiRow) this.el.aiRow.classList.toggle('hidden', !isHost);
    if (this.el.aiLobby) {
      this.el.aiLobby.value = String(room.aiCount || 0);
      if (this.el.aiLobbyValue) this.el.aiLobbyValue.textContent = String(room.aiCount || 0);
    }

    this.renderPlayers(room, playerId);

    const canStart = isHost;
    if (this.el.btnStart) {
      this.el.btnStart.classList.toggle('hidden', !canStart);
      const connected = room.players.filter((p) => p.connected).length;
      const notReady = room.players.filter((p) => p.connected && p.id !== room.hostId && !p.ready).length;
      const enough = connected >= (room.minHumans || 2);
      this.el.btnStart.disabled = !(enough && notReady === 0);
    }
    if (this.el.btnReady) {
      this.el.btnReady.classList.toggle('hidden', isHost);
    }

    let status = isHost ? 'Eres el anfitrión. Inicia cuando todos estén listos.' : 'Espera a que el anfitrión inicie la carrera.';
    if (room.players.filter((p) => p.connected).length < (room.minHumans || 2)) {
      status = 'Se necesitan al menos ' + (room.minHumans || 2) + ' jugadores reales. Comparte el código.';
    }
    this.setStatus(status, false);
  }

  renderReady() {
    if (!this.el.btnReady) return;
    this.el.btnReady.textContent = this.ready ? 'LISTO ✓' : 'MARCAR LISTO';
    this.el.btnReady.classList.toggle('on', this.ready);
  }

  renderPlayers(room, playerId) {
    const box = this.el.roomPlayers;
    if (!box) return;
    box.innerHTML = '';
    for (const p of room.players) {
      const row = document.createElement('div');
      row.className = 'lobby-player';
      if (p.id === playerId) row.classList.add('you');
      if (!p.connected) row.classList.add('offline');
      if (p.isHost) row.classList.add('host');
      const color = '#' + (Number(p.colorHex) || 0xffffff).toString(16).padStart(6, '0');
      const badge = p.isHost ? 'ANFITRIÓN' : (p.ready ? 'LISTO' : 'ESPERANDO');
      const conn = p.connected ? '' : ' · DESCONECTADO';
      row.innerHTML =
        '<span class="dot" style="background:' + color + ';box-shadow:0 0 9px ' + color + '"></span>' +
        '<span class="nm">' + escapeHtml(p.name) + (p.id === playerId ? ' (tú)' : '') + '</span>' +
        '<span class="badge">' + badge + conn + '</span>';
      box.appendChild(row);
    }
  }

  /** Bloquea o desbloquea las acciones mientras se espera al servidor. */
  setBusy(busy) {
    const el = this.el;
    for (const key of ['btnCreate', 'btnJoin', 'btnStart', 'btnReady', 'btnLeave']) {
      if (el[key]) el[key].disabled = !!busy && key !== 'btnLeave';
    }
  }
}
