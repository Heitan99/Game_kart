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
      box.innerHTML = '<div class="room-empty"><b>Sin salas abiertas</b><span>Crea una sala o únete con un código.</span></div>';
      return;
    }
    box.innerHTML = '';
    for (const room of rooms) {
      const row = document.createElement('div');
      row.className = 'room-item';
      const count = room.players.filter((p) => p.connected).length;
      const full = count >= room.maxPlayers;
      row.innerHTML =
        '<div class="room-item-main">' +
          '<span class="room-item-code mono">' + escapeHtml(room.code) + '</span>' +
          '<span class="room-item-info">' + count + '/' + room.maxPlayers + ' pilotos' +
            (room.aiCount > 0 ? ' · +' + room.aiCount + ' IA' : '') + '</span>' +
        '</div>' +
        '<button class="btn small" type="button"' + (full ? ' disabled' : '') + '>' +
          (full ? 'LLENA' : 'UNIRSE') + '</button>';
      const btn = row.querySelector('button');
      if (!full) btn.addEventListener('click', () => {
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
    const browser = byId('lobby-browser');
    if (browser) browser.classList.toggle('hidden', inRoom);
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

    const connected = room.players.filter((p) => p.connected).length;
    const countEl = byId('room-count');
    if (countEl) countEl.textContent = connected + '/' + (room.maxPlayers || 8);
    const stateEl = byId('room-state');
    if (stateEl) stateEl.textContent = isHost ? 'ANFITRIÓN' : 'EN ESPERA';

    if (this.el.aiRow) this.el.aiRow.classList.toggle('hidden', !isHost);
    if (this.el.aiLobby) {
      this.el.aiLobby.value = String(room.aiCount || 0);
      if (this.el.aiLobbyValue) this.el.aiLobbyValue.textContent = String(room.aiCount || 0);
    }

    this.renderPlayers(room, playerId);

    const canStart = isHost;
    if (this.el.btnStart) {
      this.el.btnStart.classList.toggle('hidden', !canStart);
      const notReady = room.players.filter((p) => p.connected && p.id !== room.hostId && !p.ready).length;
      const enough = connected >= (room.minHumans || 2);
      this.el.btnStart.disabled = !(enough && notReady === 0);
    }
    if (this.el.btnReady) {
      this.el.btnReady.classList.toggle('hidden', isHost);
    }

    let status = isHost ? 'Eres el anfitrión. Inicia cuando todos estén listos.' : 'Espera a que el anfitrión inicie la carrera.';
    if (connected < (room.minHumans || 2)) {
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
      const isYou = p.id === playerId;
      if (isYou) row.classList.add('you');
      if (!p.connected) row.classList.add('offline');
      if (p.isHost) row.classList.add('host');
      const color = '#' + (Number(p.colorHex) || 0xffffff).toString(16).padStart(6, '0');
      const initial = (String(p.name || '?').trim().charAt(0) || '?').toUpperCase();
      let state;
      let stateClass;
      if (!p.connected) {
        state = 'DESCONECTADO';
        stateClass = 'off';
      } else if (p.isHost) {
        state = 'ANFITRIÓN';
        stateClass = 'host';
      } else if (p.ready) {
        state = 'LISTO';
        stateClass = 'ready';
      } else {
        state = 'ESPERANDO';
        stateClass = 'wait';
      }
      const role = isYou ? 'Tú' : (p.isHost ? 'Anfitrión' : 'Piloto');
      row.innerHTML =
        '<span class="avatar" style="--team:' + color + '">' + escapeHtml(initial) + '</span>' +
        '<span class="pl-main">' +
          '<span class="nm">' + escapeHtml(p.name) + (isYou ? ' <em>tú</em>' : '') + '</span>' +
          '<span class="pl-role">' + role + '</span>' +
        '</span>' +
        '<span class="pl-state ' + stateClass + '">' + state + '</span>';
      box.appendChild(row);
    }

    const connected = room.players.filter((p) => p.connected);
    const readyEl = byId('room-ready-count');
    if (readyEl) {
      const ready = connected.filter((p) => p.ready && !p.isHost).length;
      readyEl.textContent = ready + (ready === 1 ? ' LISTO' : ' LISTOS');
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
