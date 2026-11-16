/* =====================================================================
   KART CAMPUS — orquestador del juego (cliente)
   Une escena, render, cámara, controles, audio, HUD, interfaz y red.
   Gestiona el modo individual y el multijugador online autoritativo.
   ===================================================================== */
import { THREE } from '../graphics/three.js';
import {
  CONFIG, STATE, CLIENT, detectQuality, isPortrait,
  clamp, formatTime
} from './Config.js';
import { GameState } from './GameState.js';
import { GameLoop } from './GameLoop.js';

import { SceneManager } from '../graphics/Scene.js';
import { Renderer } from '../graphics/Renderer.js';
import { CameraController } from '../graphics/Camera.js';
import { KartView } from '../vehicles/Kart.js';
import { RemoteKart } from '../vehicles/RemoteKart.js';

import { KeyboardControls } from '../controls/KeyboardControls.js';
import { TouchControls } from '../controls/TouchControls.js';
import { PlayerController } from '../vehicles/Player.js';

import { AudioManager } from '../audio/AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { Lobby } from '../ui/Lobby.js';
import { Results } from '../ui/Results.js';

import { SoloRaceManager } from '../track/RaceManager.js';
import { Checkpoints } from '../track/Checkpoints.js';

import { NetworkManager } from '../multiplayer/NetworkManager.js';
import { ClientRoomManager } from '../multiplayer/RoomManager.js';
import { PlayerSync } from '../multiplayer/PlayerSync.js';
import { Interpolation } from '../multiplayer/Interpolation.js';

import { EV } from '/shared/Protocol.js';
import { decodeSnapshot } from '/shared/Protocol.js';

function byId(id) { return document.getElementById(id); }

export class Game {
  constructor() {
    this.quality = detectQuality();
    this.touchDevice = this.quality.mobile ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    this.state = new GameState(STATE.MENU);
    this.mode = 'solo';        // 'solo' | 'online'
    this.localId = 'solo:player';
    this.resultsShown = false;

    // Render
    this.canvas = byId('game-canvas');
    this.renderer = new Renderer(this.canvas, this.quality);
    this.sceneManager = new SceneManager(this.quality);
    this.scene = this.sceneManager.scene;
    this.track = this.sceneManager.track;
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, this.quality.drawDistance);
    this.cameraController = new CameraController(this.camera);

    // Sistemas
    this.hud = new HUD(this.track, CONFIG);
    this.audio = new AudioManager(CONFIG);
    this.checkpoints = new Checkpoints({ data: this.track }, CONFIG);

    // Controles
    this.keyboard = new KeyboardControls({
      onPause: () => this.togglePause(),
      onEnter: () => this.onEnter(),
      onAnyKey: () => this.onAnyKey()
    }).attach();

    this.touch = new TouchControls({
      onPause: () => this.togglePause(),
      onAnyKey: () => this.onAnyKey()
    });

    // Interfaz
    this.menu = new Menu({
      onSolo: (name) => this.startSolo(name),
      onOnline: (name) => this.enterLobby(name),
      onAnyKey: () => this.onAnyKey()
    });
    this.lobby = new Lobby({
      onCreate: (o) => this.online.create(o),
      onJoin: (o) => this.online.join(o.code, o.name),
      onLeave: () => this.leaveLobby(),
      onReady: (r) => this.online.setReady(r),
      onStart: () => this.online.start(),
      onAI: (c) => this.online.setAI(c),
      onCopyCode: (c) => this.copyCode(c),
      onRefresh: () => this.online.requestList(),
      onAnyKey: () => this.onAnyKey()
    });
    this.results = new Results({
      onAgain: () => this.onAgain(),
      onMenu: () => this.toMenu()
    });

    // Red (perezosa)
    this.network = null;
    this.online = null;
    this.playerSync = null;
    this.interpolation = null;
    this.remoteKarts = new Map();
    this.remoteInfo = new Map();
    this.kartViews = new Map();
    this.networkHooked = false;

    this.race = { state: STATE.MENU, time: 0, countdown: 0, goTimer: 0, standings: [] };
    this.soloRace = null;
    this.inputAcc = 0;
    this.neutralAcc = 0;
    this.countdownText = '';
    this.lastBeep = -1;

    this.bindUi();
    this.bindWindow();
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (dt, elapsed) => this.render(dt, elapsed)
    });
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                           */
  /* ------------------------------------------------------------------ */
  start() {
    this.touch.mount(byId('touch-controls'));
    this.applyTouchVisibility();
    this.resize();
    this.loop.start();
    this.hideBoot();
    this.menu.show(true);
    this.refreshRoomListLoop();

    // Red en segundo plano para disponer de la lista de salas al entrar.
    this.ensureNetwork();
    if (this.quality.mobile) this.requestFullscreenOnGesture();
  }

  hideBoot() {
    const boot = byId('boot');
    if (boot) {
      boot.classList.add('off');
      setTimeout(() => { boot.style.display = 'none'; }, 600);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Eventos de UI y ventana                                            */
  /* ------------------------------------------------------------------ */
  bindUi() {
    const pauseBtn = byId('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());

    const resumeBtn = byId('resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.togglePause(false));

    const restartBtn = byId('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', () => this.onRestart());

    const menuBtn = byId('menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', () => this.toMenu());

    const lobbyMenuBtn = byId('btn-lobby-menu');
    if (lobbyMenuBtn) lobbyMenuBtn.addEventListener('click', () => this.leaveLobby());

    const fullscreenBtn = byId('btn-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        this.onAnyKey();
        this.toggleFullscreen();
      });
    }

    const audioBtn = byId('btn-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        this.onAnyKey();
        const on = this.audio.toggle();
        audioBtn.classList.toggle('muted', !on);
        audioBtn.textContent = on ? '🔊' : '🔇';
      });
    }
  }

  bindWindow() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.keyboard.clear();
        this.touch.clear();
        if (this.state.current === STATE.RACING && this.mode === 'solo') this.togglePause(true);
      } else {
        this.loop.lastTime = 0;
      }
    });

    window.addEventListener('blur', () => {
      this.keyboard.clear();
      this.touch.clear();
    });

    // Reanuda el audio en el primer gesto.
    const resume = () => this.onAnyKey();
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  resize() {
    const { w, h } = this.renderer.resize();
    this.cameraController.resize(w / h);
    this.updateOrientation();
  }

  updateOrientation() {
    const prompt = byId('orientation-prompt');
    if (!prompt) return;
    const show = this.quality.mobile && isPortrait();
    prompt.classList.toggle('on', show);
  }

  requestFullscreenOnGesture() {
    const go = () => {
      // Solo desde menú/lobby: pedir pantalla completa a mitad de carrera
      // puede reajustar el layout y soltar los controles táctiles.
      if (this.state.current === STATE.MENU || this.state.current === STATE.LOBBY) {
        this.toggleFullscreen(true);
      }
      window.removeEventListener('pointerdown', go);
    };
    window.addEventListener('pointerdown', go, { once: true });
  }

  toggleFullscreen(force) {
    try {
      const el = document.documentElement;
      const want = force !== undefined ? force : !document.fullscreenElement;
      let result = null;
      if (want && !document.fullscreenElement) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (req) result = req.call(el);
      } else if (!want && document.fullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) result = exit.call(document);
      }
      // La API devuelve una promesa que puede rechazarse (permisos, modo
      // headless, etc.); la capturamos para no dejar errores sin manejar.
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (e) { /* el navegador puede rechazarlo */ }
  }

  applyTouchVisibility() {
    const show = this.touchDevice && (this.state.current === STATE.RACING || this.state.current === STATE.COUNTDOWN);
    this.touch.show(show);
    const badge = byId('touch-hint');
    if (badge) badge.classList.toggle('hidden', !this.touchDevice);
  }

  onAnyKey() {
    this.audio.init();
  }

  onEnter() {
    if (this.state.current === STATE.MENU) this.menu.emitSolo();
  }

  toast(text, ms = 2200) {
    const el = byId('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }

  copyCode(code) {
    if (!code) return;
    const done = () => this.toast('Código ' + code + ' copiado');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => this.fallbackCopy(code, done));
    } else {
      this.fallbackCopy(code, done);
    }
  }

  fallbackCopy(text, done) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      done();
    } catch (e) {
      this.toast('Copia manualmente: ' + text);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modo individual                                                    */
  /* ------------------------------------------------------------------ */
  startSolo(name) {
    this.mode = 'solo';
    this.localId = 'solo:player';
    this.leaveOnlineSilently();
    this.clearKartViews();

    this.soloRace = new SoloRaceManager({
      track: { data: this.track },
      config: CONFIG,
      playerName: name || 'TÚ',
      colorHex: 0x2fe3ff
    });
    // SoloRaceManager espera la geometría; le pasamos la data ya calculada.
    this.soloRace.track = this.track;

    const karts = this.soloRace.setup(2);
    for (const kart of karts) {
      const isLocal = kart.isPlayer;
      const view = new KartView(this.scene, kart, { showLabel: false, isLocal: isLocal });
      this.kartViews.set(kart.id, view);
    }

    this.hud.setStandingsCount(karts.length);
    this.menu.show(false);
    this.lobby.show(false);
    this.results.show(false);
    this.resultsShown = false;
    this.race = this.soloRace.race;
    this.soloRace.start();
    this.state.set(STATE.COUNTDOWN);
    this.applyTouchVisibility();
    this.hud.show(true);
    this.setConnectionBadge('');

    // Coloca la cámara tras el jugador desde el primer fotograma.
    this.cameraController.snapBehind(this.soloRace.player);
  }

  updateSolo(dt) {
    const input = this.readInput();
    this.soloRace.update(dt, input);
    this.race = this.soloRace.race;

    // Sincroniza el estado de la aplicación con la carrera local.
    if (this.race.state === STATE.RACING && this.state.current === STATE.COUNTDOWN) {
      this.state.set(STATE.RACING);
      this.applyTouchVisibility();
    }

    for (const kart of this.soloRace.karts) {
      const view = this.kartViews.get(kart.id);
      if (view) view.update(kart, this.loop.elapsed);
    }

    const local = this.soloRace.player;
    this.cameraController.update(dt, this.state.current, local);
    this.sceneManager.update(local, dt);
    this.updateCountdownUI();

    if (this.race.state === STATE.RESULTS && !this.resultsShown) {
      this.showResults(this.soloRace.results(), true);
      return;
    }
    if (this.race.state === STATE.RACING || this.race.state === STATE.COUNTDOWN) {
      this.hud.update(this.hudData(local));
    }
    this.pushAudio(local);
  }

  /* ------------------------------------------------------------------ */
  /* Modo online                                                        */
  /* ------------------------------------------------------------------ */
  ensureNetwork() {
    if (this.network) return this.network;
    this.network = new NetworkManager();
    this.online = new ClientRoomManager(this.network);
    this.interpolation = new Interpolation(CLIENT.interpDelay);

    this.online.onError = (err) => this.onNetworkError(err);
    this.online.onRoom = (room) => this.onRoomUpdate(room);
    this.online.onRooms = (rooms) => { if (!this.online.room) this.lobby.setPublicRooms(rooms); };
    this.online.onLeft = () => this.toMenu();

    try {
      this.network.connect();
    } catch (err) {
      this.menu.setNote('No se pudo conectar al servidor. Usa «Jugar solo».');
      return this.network;
    }
    this.hookNetwork();
    return this.network;
  }

  refreshRoomListLoop() {
    this._listTimer = setInterval(() => {
      if (this.network && this.network.connected && this.state.current === STATE.LOBBY && this.online && !this.online.room) {
        this.online.requestList();
      }
    }, 4000);
  }

  hookNetwork() {
    if (this.networkHooked) return;
    this.networkHooked = true;
    const n = this.network;

    n.on('connect', () => {
      this.network.syncClock().catch(() => {});
      this.setConnectionBadge('conectado', false);
    });
    n.on('disconnect', () => {
      this.setConnectionBadge('reconectando…', true);
    });
    n.on('connect_error', () => {
      this.setConnectionBadge('sin conexión', true);
    });

    n.on(EV.RACE_START, (data) => this.onRaceStart(data));
    n.on(EV.SNAPSHOT, (data) => this.onSnapshot(data));
    n.on(EV.RACE_FINISH, (data) => this.onRaceFinish(data));
    n.on(EV.PLAYER_DISCONNECTED, (d) => this.onPlayerDisconnected(d));
    n.on(EV.PLAYER_RECONNECTED, (d) => {
      this.toast((d && d.name ? d.name : 'Un jugador') + ' se ha reconectado');
      this.hideDisconnectBanner();
    });
    n.on(EV.PLAYER_LEFT, (d) => {
      if (d && d.playerId) this.removeRemoteKart(d.playerId);
    });
    n.on(EV.HOST_CHANGED, () => { /* el lobby se refresca con room:update */ });
  }

  setConnectionBadge(text, warn) {
    const el = byId('connection-badge');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('on', !!text);
    el.classList.toggle('warn', !!warn);
  }

  enterLobby(name) {
    this.mode = 'online';
    this.state.set(STATE.LOBBY);
    this.menu.show(false);
    this.lobby.show(true);
    this.hud.show(false);
    this.ensureNetwork();
    if (this.network && this.network.connected) {
      this.online.requestList();
      this.lobby.setStatus('Elige crear una sala o unirte con un código.');
    } else {
      this.lobby.setStatus('Conectando con el servidor…');
    }
  }

  leaveLobby() {
    if (this.online && this.online.room) this.online.leave();
    else this.toMenu();
  }

  onRoomUpdate(room) {
    if (this.state.current === STATE.LOBBY) {
      this.lobby.setRoom(room, this.online.playerId);
    } else if (room && this.state.current === STATE.RESULTS) {
      // Permite reiniciar desde resultados: el host ve el botón.
      this.updateAgainAvailability();
    }
  }

  onNetworkError(err) {
    const msg = (err && err.message) || 'Error de red';
    if (this.state.current === STATE.LOBBY) this.lobby.setStatus(msg, true);
    else this.toast(msg);
    if (err && err.code === 'ROOM_NOT_FOUND') {
      this.lobby.setStatus('Esa sala no existe. Revisa el código.', true);
    }
  }

  onRaceStart(data) {
    if (!data) return;
    this.mode = 'online';
    this.localId = this.online.playerId;

    this.lobby.show(false);
    this.results.show(false);
    this.resultsShown = false;
    this.state.set(STATE.COUNTDOWN);

    // Estado del jugador local.
    this.playerSync = new PlayerSync({
      playerId: this.localId,
      track: this.track,
      config: CONFIG,
      name: this.playerName(),
      colorHex: this.colorHex()
    });
    const localInfo = (data.karts || []).find((k) => k.id === this.localId);
    this.playerSync.initFrom(localInfo || { id: this.localId, name: this.playerName(), colorHex: this.colorHex() });

    // Vistas.
    this.clearKartViews();
    this.interpolation.reset();
    const localView = new KartView(this.scene, {
      id: this.localId, name: this.playerName(), colorHex: this.colorHex()
    }, { showLabel: false, isLocal: true });
    this.kartViews.set(this.localId, localView);

    this.hud.setStandingsCount((data.karts || []).length || 2);
    this.hud.show(true);
    this.applyTouchVisibility();
    this.cameraController.snapBehind(this.playerSync.state);

    this.race = {
      state: STATE.COUNTDOWN,
      time: 0,
      countdown: data.countdown || CONFIG.race.countdown,
      goTimer: 0,
      standings: []
    };
    this.setConnectionBadge('en línea', false);
    this.toast(data.reconnected ? 'Reconectado a la carrera' : '¡Carrera encontrada!');
  }

  onSnapshot(msg) {
    if (this.mode !== 'online' || !msg) return;
    const snap = decodeSnapshot(msg);
    this.interpolation.ingest(snap);

    // Reconciliación del jugador local.
    const mine = snap.karts.find((k) => k.id === this.localId);
    if (mine && this.playerSync) this.playerSync.reconcile(mine);

    this.race.state = snap.state;
    this.race.time = snap.time;
    this.race.countdown = snap.countdown;
    if (snap.state === STATE.RACING && this.state.current === STATE.COUNTDOWN) {
      this.state.set(STATE.RACING);
      this.applyTouchVisibility();
    }
    // Estado de carrera desconectada/terminada.
    if (snap.state !== STATE.RESULTS && this.state.current === STATE.RESULTS) {
      this.state.set(STATE.RACING);
      this.results.show(false);
      this.resultsShown = false;
    }

    // Asegura vistas de los karts remotos.
    for (const k of snap.karts) {
      if (k.id === this.localId) continue;
      this.ensureRemoteKart(k);
    }
    this.race.standings = snap.karts
      .slice()
      .sort((a, b) => (a.position || 99) - (b.position || 99));
  }

  ensureRemoteKart(info) {
    if (this.remoteKarts.has(info.id)) {
      const known = this.remoteInfo.get(info.id);
      if (known) { known.name = info.name; known.colorHex = info.colorHex; }
      return this.remoteKarts.get(info.id);
    }
    const remote = new RemoteKart(this.scene, {
      id: info.id, name: info.name, colorHex: info.colorHex
    }, this.interpolation);
    this.remoteKarts.set(info.id, remote);
    this.remoteInfo.set(info.id, { name: info.name, colorHex: info.colorHex });
    return remote;
  }

  removeRemoteKart(id) {
    const r = this.remoteKarts.get(id);
    if (r) { r.dispose(); this.remoteKarts.delete(id); }
    this.remoteInfo.delete(id);
  }

  updateOnline(dt) {
    this.interpolation.advance(dt);

    const raw = this.readRaw();
    const turbo = this.readTurbo();
    const active = this.state.current === STATE.RACING || this.state.current === STATE.COUNTDOWN;

    if (active && this.playerSync) {
      this.playerController().setControls({ throttle: raw.throttle, brake: raw.brake, steer: raw.steer, turbo: turbo });
      const pc = this.playerController();
      const inp = pc.stepInput();
      this.playerSync.step(dt, inp);

      this.inputAcc += dt;
      if (this.inputAcc >= 1 / CONFIG.network.inputRate) {
        this.inputAcc = 0;
        this.network.emit(EV.INPUT, pc.networkInput());
        pc.consumeTurbo();
      }
    } else if (this.state.current === STATE.PAUSED && this.network && this.network.connected) {
      // Mientras está en pausa, envía entradas neutras.
      this.neutralAcc += dt;
      if (this.neutralAcc >= 1 / 10) {
        this.neutralAcc = 0;
        const pc = this.playerController();
        pc.input.throttle = 0; pc.input.brake = 0; pc.input.steer = 0;
        pc.turboLatch = false; pc.prevTurbo = false;
        this.network.emit(EV.INPUT, pc.networkInput());
      }
    }

    // Actualiza vistas.
    if (this.kartViews.has(this.localId)) {
      this.kartViews.get(this.localId).update(this.playerSync.state, this.loop.elapsed);
    }
    for (const [, remote] of this.remoteKarts) remote.update(this.loop.elapsed);

    const local = this.playerSync ? this.playerSync.state : null;
    this.cameraController.update(dt, this.state.current, local);
    if (local) this.sceneManager.update(local, dt);
    this.updateCountdownUI();

    if (local && (this.state.current === STATE.RACING || this.state.current === STATE.COUNTDOWN)) {
      this.hud.update(this.hudData(local));
    }
    if (local) this.pushAudio(local);
  }

  playerController() {
    if (!this._pc) this._pc = new PlayerController('local', CONFIG);
    return this._pc;
  }

  onRaceFinish(data) {
    if (!data) return;
    this.showResults(data.results || [], data.raceTime || 0, false);
  }

  onPlayerDisconnected(d) {
    if (!d) return;
    const mine = d.playerId === this.localId;
    const banner = byId('disconnect-banner');
    const textEl = byId('disconnect-text');
    if (banner && textEl) {
      textEl.textContent = mine
        ? 'Has perdido la conexión. Reintentando…'
        : (d.name || 'Un jugador') + ' se ha desconectado (esperando reconexión)';
      banner.classList.add('on');
    }
    if (!mine) this.setRemoteDisconnected(d.playerId, true);
    setTimeout(() => this.hideDisconnectBanner(), (d.grace || 30) * 1000);
  }

  hideDisconnectBanner() {
    const banner = byId('disconnect-banner');
    if (banner) banner.classList.remove('on');
  }

  setRemoteDisconnected(id, on) {
    const view = this.remoteKarts.get(id);
    if (view && view.view && view.view.group) {
      view.view.group.traverse((o) => {
        if (o.isMesh || o.isSprite) {
          if (!o.userData._origMat) o.userData._origMat = o.material;
        }
      });
      // Atenúa el kart desconectado.
      if (view.view.label) view.view.label.visible = !on;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Entrada combinada                                                  */
  /* ------------------------------------------------------------------ */
  readRaw() {
    const kb = this.keyboard.read();
    const tc = this.touch.read();
    const brake = Math.max(kb.brake, tc.brake);
    // El freno manda sobre el acelerador: en móvil es habitual mantener el
    // acelerador pulsado y tocar FRENO para reducir o retroceder. Si ambos
    // se suman, el kart se queda clavado y nunca llega a ir en reversa.
    const throttle = brake > 0 ? 0 : Math.max(kb.throttle, tc.throttle);
    return {
      throttle: throttle,
      brake: brake,
      steer: clamp(kb.steer + tc.steer, -1, 1)
    };
  }

  readTurbo() {
    const a = this.keyboard.consumeTurbo();
    const b = this.touch.consumeTurbo();
    return a || b;
  }

  readInput() {
    const raw = this.readRaw();
    raw.turbo = this.readTurbo();
    return raw;
  }

  /* ------------------------------------------------------------------ */
  /* Pausa, reinicio, menú, resultados                                  */
  /* ------------------------------------------------------------------ */
  togglePause(force) {
    if (this.state.current === STATE.RACING || this.state.current === STATE.COUNTDOWN) {
      if (this.mode === 'solo') {
        this.state.transitionToPause();
        this.showPause(true);
      } else {
        // Online: la carrera sigue en el servidor; solo cubrimos la pantalla.
        this.state.transitionToPause();
        this.showPause(true, true);
        this.keyboard.clear();
        this.touch.clear();
      }
    } else if (this.state.current === STATE.PAUSED) {
      if (force === true) return;
      this.state.resume();
      this.showPause(false);
      this.inputAcc = 0;
    }
  }

  showPause(on, onlineNote) {
    const overlay = byId('overlay-pause');
    if (overlay) overlay.classList.toggle('on', !!on);
    const note = byId('pause-note');
    if (note) {
      note.classList.toggle('hidden', !onlineNote);
      if (onlineNote) note.textContent = 'La carrera online continúa en el servidor. Tu kart esperará en la pista.';
    }
  }

  onRestart() {
    if (this.mode === 'solo') {
      this.showPause(false);
      this.clearKartViews();
      const karts = this.soloRace.setup(2);
      for (const kart of karts) {
        this.kartViews.set(kart.id, new KartView(this.scene, kart, { showLabel: false, isLocal: kart.isPlayer }));
      }
      this.hud.setStandingsCount(karts.length);
      this.resultsShown = false;
      this.results.show(false);
      this.race = this.soloRace.race;
      this.soloRace.start();
      this.state.set(STATE.COUNTDOWN);
      this.cameraController.snapBehind(this.soloRace.player);
      this.applyTouchVisibility();
    } else {
      this.showPause(false);
      if (this.online && this.online.isHost()) {
        this.online.restart();
        this.toast('Reiniciando la carrera…');
      } else {
        this.toast('Solo el anfitrión puede reiniciar');
      }
    }
  }

  onAgain() {
    this.results.show(false);
    this.resultsShown = false;
    if (this.mode === 'solo') {
      this.onRestart();
    } else if (this.online && this.online.isHost()) {
      this.online.restart();
      this.state.set(STATE.COUNTDOWN);
    } else {
      this.toast('Espera a que el anfitrión reinicie la carrera');
      this.results.show(true);
      this.resultsShown = true;
    }
  }

  updateAgainAvailability() {
    const btn = byId('btn-again');
    if (!btn) return;
    const canRestart = this.mode === 'solo' || (this.online && this.online.isHost());
    btn.classList.toggle('hidden', !canRestart);
  }

  showResults(results, raceTime, solo) {
    this.resultsShown = true;
    this.state.set(STATE.RESULTS);
    this.hud.show(false);
    this.touch.show(false);
    this.updateAgainAvailability();
    this.results.render({
      results: results || [],
      localId: this.localId,
      mode: solo ? 'solo' : 'online',
      canRestart: this.mode === 'solo' || (this.online && this.online.isHost())
    });
    this.results.show(true);
    if (solo) this.audio.beep(true);
  }

  toMenu() {
    this.leaveOnlineSilently();
    this.remoteKarts.forEach((r) => r.dispose());
    this.remoteKarts.clear();
    this.clearKartViews();
    this.playerSync = null;
    if (this.interpolation) this.interpolation.reset();
    this.results.show(false);
    this.lobby.show(false);
    this.showPause(false);
    this.hud.show(false);
    this.touch.show(false);
    this.resultsShown = false;
    this.mode = 'solo';
    this.state.set(STATE.MENU);
    this.race = { state: STATE.MENU, time: 0, countdown: 0, goTimer: 0, standings: [] };
    this.setConnectionBadge('');
    this.menu.show(true);
  }

  leaveOnlineSilently() {
    if (this.online && this.online.room) {
      try { this.online.leave(); } catch (e) { /* ignorar */ }
    }
  }

  clearKartViews() {
    for (const [, view] of this.kartViews) view.dispose();
    this.kartViews.clear();
  }

  /* ------------------------------------------------------------------ */
  /* Cuenta atrás y HUD                                                 */
  /* ------------------------------------------------------------------ */
  updateCountdownUI() {
    const overlay = byId('overlay-countdown');
    const textEl = byId('countdown-text');
    const r = this.race;

    let text = '';
    let go = false;
    if (r.state === STATE.COUNTDOWN) {
      const n = Math.max(1, Math.ceil(r.countdown || 0));
      text = String(n);
    } else if (r.state === STATE.RACING && r.goTimer > 0) {
      text = '¡YA!';
      go = true;
    }

    if (textEl && textEl.textContent !== text) {
      textEl.textContent = text || '';
      textEl.classList.toggle('go', go);
      if (text) {
        textEl.classList.remove('pop');
        void textEl.offsetWidth;
        textEl.classList.add('pop');
      }
      // Pitidos de cuenta atrás.
      const isNum = /^\d+$/.test(text);
      if (isNum) {
        const n = Number(text);
        if (n !== this.lastBeep) { this.audio.beep(false); this.lastBeep = n; }
      } else if (go && this.lastBeep !== 0) {
        this.audio.beep(true);
        this.lastBeep = 0;
      }
    }
    if (overlay) overlay.classList.toggle('on', !!text);
  }

  hudData(localKart) {
    const karts = this.collectVisibleKarts();
    const standings = this.buildStandings(karts);
    const nextGate = localKart.nextGate;
    return {
      speed: localKart.speed,
      time: this.race.time,
      laps: localKart.laps,
      totalLaps: CONFIG.race.laps,
      position: localKart.position || 1,
      offRoad: localKart.offRoad,
      turboState: localKart.turboState,
      turboTimer: localKart.turboTimer,
      nextGate: nextGate,
      checkpoints: CONFIG.race.checkpoints,
      finished: localKart.finished,
      standings: standings,
      karts: karts,
      localId: this.localId
    };
  }

  collectVisibleKarts() {
    const out = [];
    if (this.mode === 'online') {
      if (this.playerSync) out.push({
        id: this.localId, name: this.playerName(), colorHex: this.colorHex(),
        x: this.playerSync.state.x, z: this.playerSync.state.z,
        position: this.playerSync.state.position, laps: this.playerSync.state.laps,
        finished: this.playerSync.state.finished
      });
      for (const [id, remote] of this.remoteKarts) {
        const s = this.interpolation.sample(id);
        if (s) out.push({
          id: id, name: this.remoteName(id), colorHex: this.remoteColor(id),
          x: s.x, z: s.z, position: s.position, laps: s.laps, finished: s.finished
        });
      }
    } else if (this.soloRace) {
      for (const k of this.soloRace.karts) {
        out.push({
          id: k.id, name: k.name, colorHex: k.colorHex,
          x: k.x, z: k.z, position: k.position, laps: k.laps, finished: k.finished
        });
      }
    }
    return out;
  }

  buildStandings(karts) {
    if (this.mode === 'online' && this.race.standings && this.race.standings.length) {
      return this.race.standings.map((k) => ({
        id: k.id, name: k.name, colorHex: k.colorHex,
        position: k.position, laps: k.laps, finished: k.finished
      }));
    }
    const arr = karts.slice();
    arr.sort((a, b) => (a.position || 99) - (b.position || 99));
    return arr;
  }

  pushAudio(local) {
    if (!this.audio.ready) return;
    const ratio = clamp(Math.abs(local.speed) / (CONFIG.kart.maxSpeed * CONFIG.turbo.speedMultiplier), 0, 1.4);
    this.audio.setEngine(ratio, local.turboState === 'active', local.offRoad);
  }

  /* ------------------------------------------------------------------ */
  /* Registro por frame                                                 */
  /* ------------------------------------------------------------------ */
  update(dt) {
    this.touch.read();

    if (this.state.current === STATE.MENU || this.state.current === STATE.LOBBY) {
      this.cameraController.updateMenu(dt);
      this.sceneManager.update(null, dt);
      return;
    }
    if (this.state.current === STATE.PAUSED) {
      this.sceneManager.update(this.currentFocus(), dt);
      return;
    }
    if (this.state.current === STATE.COUNTDOWN || this.state.current === STATE.RACING) {
      if (this.mode === 'solo') this.updateSolo(dt);
      else this.updateOnline(dt);
    }
  }

  currentFocus() {
    if (this.mode === 'solo' && this.soloRace) return this.soloRace.player;
    if (this.mode === 'online' && this.playerSync) return this.playerSync.state;
    return null;
  }

  render() {
    if (this.kartViews.has(this.localId) && this.playerSync) {
      // En online la vista local ya se actualiza en updateOnline.
    }
    this.renderer.render(this.scene, this.camera);
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                         */
  /* ------------------------------------------------------------------ */
  playerName() {
    if (this.playerSync) return this.playerSync.state.name;
    if (this.soloRace && this.soloRace.player) return this.soloRace.player.name;
    return 'TÚ';
  }

  colorHex() {
    return 0x2fe3ff;
  }

  remoteName(id) {
    const info = this.remoteInfo.get(id);
    return info ? info.name : 'PILOTO';
  }

  remoteColor(id) {
    const info = this.remoteInfo.get(id);
    return info ? info.colorHex : 0xffffff;
  }
}

function clamp01(v) {
  v = Number(v) || 0;
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}
