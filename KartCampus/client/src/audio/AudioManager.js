/* =====================================================================
   KART CAMPUS — audio procedural (WebAudio)
   Motor, turbo, colisiones y ambiente sintetizados en tiempo real.
   No requiere archivos de audio externos: todo es original.
   ===================================================================== */
import { CONFIG, clamp } from '../core/Config.js';

export class AudioManager {
  constructor(config = CONFIG) {
    this.config = config;
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.ambientGain = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.ready = false;
  }

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.config.audio.master : 0;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoiseBuffer(1.0);
      this.buildEngine();
      this.buildAmbient();
      this.ready = true;
    } catch (err) {
      this.ctx = null;
    }
  }

  makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  buildEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 4;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;

    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 82;

    const mix2 = ctx.createGain();
    mix2.gain.value = 0.35;

    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(mix2);
    mix2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    this.engineOsc.start();
    this.engineOsc2.start();
  }

  buildAmbient() {
    const ctx = this.ctx;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = this.enabled ? this.config.audio.ambient : 0;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    src.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    src.start();
    this.ambientSrc = src;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? this.config.audio.master : 0, now, 0.05);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  /** Actualiza el sonido del motor según velocidad y estado. */
  setEngine(speedRatio, turbo, offRoad) {
    if (!this.ctx || !this.engineOsc) return;
    const now = this.ctx.currentTime;
    const r = clamp(speedRatio, 0, 1.4);
    const base = 46 + r * 175 + (turbo ? 55 : 0);
    this.engineOsc.frequency.setTargetAtTime(base, now, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(base * 1.51, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(420 + r * 1500 + (turbo ? 600 : 0), now, 0.1);
    const vol = this.enabled ? (0.045 + r * 0.12 + (turbo ? 0.05 : 0)) : 0;
    this.engineGain.gain.setTargetAtTime(vol, now, 0.1);
    this.engineGain.gain.setTargetAtTime(offRoad ? vol * 0.7 : vol, now, 0.2);
  }

  /** Silbido de turbo. */
  turbo() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.45);
    filter.Q.value = 2.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.45 * this.config.audio.effects, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(now); src.stop(now + 0.65);
  }

  /** Impacto entre karts. */
  collision(strength) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = clamp(strength, 0.1, 1);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + s * 500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * s * this.config.audio.effects, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(now); src.stop(now + 0.28);
  }

  /** Clic de interfaz. */
  click() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
    gain.gain.setValueAtTime(0.12 * this.config.audio.effects, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain); gain.connect(this.master);
    osc.start(now); osc.stop(now + 0.12);
  }

  /** Pitido de cuenta atrás. */
  beep(high) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = high ? 880 : 460;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22 * this.config.audio.effects, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (high ? 0.5 : 0.18));
    osc.connect(gain); gain.connect(this.master);
    osc.start(now); osc.stop(now + 0.55);
  }

  setAmbientLevel(level) {
    if (!this.ctx || !this.ambientGain) return;
    this.ambientGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.2);
  }
}