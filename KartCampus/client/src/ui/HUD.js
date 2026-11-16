/* =====================================================================
   KART CAMPUS — HUD y minimapa
   ===================================================================== */
import { CONFIG, clamp, formatTime } from '../core/Config.js';

function byId(id) { return document.getElementById(id); }

export class HUD {
  constructor(track, config = CONFIG) {
    this.track = track;
    this.config = config;
    this.el = {
      root: byId('hud'),
      pos: byId('pos-val'),
      lap: byId('lap-val'),
      timer: byId('timer-val'),
      speed: byId('speed-val'),
      gear: byId('gear-ind'),
      turbo: byId('hud-turbo'),
      turboState: byId('turbo-state'),
      turboFill: byId('turbo-fill'),
      cp: byId('hud-cp'),
      fxTurbo: byId('fx-turbo'),
      standings: byId('standings-list'),
      minimap: byId('minimap')
    };
    this.ctx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.rows = [];
    this.scale = 1;
    this.ox = 0;
    this.oz = 0;
    this.setupMinimap();
  }

  setupMinimap() {
    if (!this.el.minimap) return;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    const b = this.track.bounds;
    const pad = 18;
    const bw = b.maxX - b.minX;
    const bz = b.maxZ - b.minZ;
    this.scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bz);
    this.ox = (W - bw * this.scale) / 2 - b.minX * this.scale;
    this.oz = (H - bz * this.scale) / 2 - b.minZ * this.scale;
  }

  show(on) {
    if (this.el.root) this.el.root.classList.toggle('on', !!on);
  }

  setStandingsCount(n) {
    if (!this.el.standings) return;
    this.el.standings.innerHTML = '';
    this.rows = [];
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'stand-row';
      const p = document.createElement('span'); p.className = 'p mono';
      const dot = document.createElement('span'); dot.className = 'dot';
      const nm = document.createElement('span'); nm.className = 'nm';
      const lb = document.createElement('span'); lb.className = 'lb mono';
      row.appendChild(p); row.appendChild(dot); row.appendChild(nm); row.appendChild(lb);
      this.el.standings.appendChild(row);
      this.rows.push({ row, p, dot, nm, lb });
    }
  }

  update(data) {
    const d = data || {};
    const el = this.el;
    if (el.speed) el.speed.textContent = String(Math.round(Math.abs(d.speed || 0) * 3.6));
    if (el.timer) el.timer.textContent = formatTime(d.time || 0);
    if (el.lap) el.lap.textContent = Math.min((d.laps || 0) + 1, d.totalLaps || 3) + ' / ' + (d.totalLaps || 3);
    if (el.pos) el.pos.textContent = 'P' + (d.position || 1);

    let gear = 'EN PISTA';
    let gearColor = '#b8ff45';
    if (d.finished) { gear = 'META'; gearColor = '#b8ff45'; }
    else if (d.offRoad) { gear = 'CÉSPED · LENTO'; gearColor = '#ff7a4a'; }
    else if (d.turboState === 'active') { gear = 'TURBO'; gearColor = '#3ce8ff'; }
    else if ((d.speed || 0) < -0.6) { gear = 'REVERSA'; gearColor = '#ffb340'; }
    if (el.gear) { el.gear.textContent = gear; el.gear.style.color = gearColor; }

    let pct = 1, label = 'LISTO', cls = '';
    if (d.turboState === 'active') {
      pct = clamp((d.turboTimer || 0) / this.config.turbo.duration, 0, 1);
      label = 'ACTIVO'; cls = 'active';
    } else if (d.turboState === 'recharging') {
      pct = 1 - clamp((d.turboTimer || 0) / this.config.turbo.recharge, 0, 1);
      label = 'RECARGANDO'; cls = 'recharging';
    }
    if (el.turboFill) el.turboFill.style.width = (pct * 100).toFixed(1) + '%';
    if (el.turboState) el.turboState.textContent = label;
    if (el.turbo) {
      el.turbo.classList.toggle('active', cls === 'active');
      el.turbo.classList.toggle('recharging', cls === 'recharging');
    }
    if (el.fxTurbo) el.fxTurbo.style.opacity = cls === 'active' ? '1' : '0';

    if (el.cp) {
      if (d.finished) el.cp.textContent = 'CARRERA COMPLETADA';
      else if (d.nextGate === 0) el.cp.textContent = 'SIGUIENTE: META';
      else el.cp.textContent = 'SIGUIENTE CONTROL: ' + (d.nextGate || 1) + ' / ' + (d.checkpoints || 4);
    }

    this.updateStandings(d.standings || [], d.localId);
    this.drawMinimap(d.karts || [], d.localId);
  }

  updateStandings(standings, localId) {
    if (!this.rows.length) return;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const k = standings[i];
      if (!k) { row.row.style.display = 'none'; continue; }
      row.row.style.display = '';
      const color = '#' + (Number(k.colorHex) || 0xffffff).toString(16).padStart(6, '0');
      row.p.textContent = String(k.position !== undefined ? k.position : i + 1);
      row.dot.style.background = color;
      row.dot.style.boxShadow = '0 0 9px ' + color;
      row.nm.textContent = k.name || 'PILOTO';
      row.lb.textContent = k.finished ? 'META' : ('V' + Math.min((k.laps || 0) + 1, this.config.race.laps));
      row.row.classList.toggle('you', k.id === localId);
    }
  }

  drawMinimap(karts, localId) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    ctx.clearRect(0, 0, W, H);

    const mapX = (x) => x * this.scale + this.ox;
    const mapZ = (z) => z * this.scale + this.oz;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(96,116,136,0.9)';
    ctx.lineWidth = Math.max(9, this.track.halfWidth * 2 * this.scale);
    ctx.beginPath();
    for (let i = 0; i < this.track.pts.length; i++) {
      const p = this.track.pts[i];
      if (i === 0) ctx.moveTo(mapX(p.x), mapZ(p.z));
      else ctx.lineTo(mapX(p.x), mapZ(p.z));
    }
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(60,232,255,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    for (let i = 0; i < this.track.pts.length; i += 2) {
      const p = this.track.pts[i];
      if (i === 0) ctx.moveTo(mapX(p.x), mapZ(p.z));
      else ctx.lineTo(mapX(p.x), mapZ(p.z));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    const gateColors = [0xffffff, 0x3ce8ff, 0xff2e88, 0xb8ff45, 0xffb340];
    for (const g of this.track.gates) {
      if (g.isFinish) continue;
      ctx.fillStyle = '#' + gateColors[g.index].toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(mapX(g.x), mapZ(g.z), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const finish = this.track.gates[0];
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(mapX(finish.x) - 4, mapZ(finish.z) - 4, 8, 8);

    for (const k of karts) {
      if (k.x === undefined) continue;
      const color = '#' + (Number(k.colorHex) || 0xffffff).toString(16).padStart(6, '0');
      const local = k.id === localId;
      const r = local ? 6 : 4.6;
      ctx.beginPath();
      ctx.arc(mapX(k.x), mapZ(k.z), r + 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mapX(k.x), mapZ(k.z), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (local) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}