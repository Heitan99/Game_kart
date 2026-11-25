import { THREE } from './three.js';
import { mulberry32 } from '../core/Config.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTex(canvas, rx, ry) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx === undefined ? 1 : rx, ry === undefined ? 1 : ry);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function makeAsphaltTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#363b43';
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(101);
  for (let i = 0; i < 4200; i++) {
    const x = rng() * 256, y = rng() * 256;
    const v = 40 + Math.floor(rng() * 55);
    g.fillStyle = 'rgba(' + v + ',' + (v + 3) + ',' + (v + 8) + ',' + (0.25 + rng() * 0.5) + ')';
    const s = 1 + rng() * 2;
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = 'rgba(20,23,28,' + (0.12 + rng() * 0.16) + ')';
    g.lineWidth = 1;
    g.beginPath();
    let x = rng() * 256, y = rng() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 26; y += (rng() - 0.5) * 26; g.lineTo(x, y); }
    g.stroke();
  }
  return canvasTex(c, 1, 1);
}

export function makeGrassTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#3e7834';
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(202);
  for (let i = 0; i < 7000; i++) {
    const x = rng() * 256, y = rng() * 256;
    const pick = rng();
    let col;
    if (pick < 0.4) col = 'rgba(60,120,48,0.55)';
    else if (pick < 0.72) col = 'rgba(88,150,62,0.5)';
    else if (pick < 0.9) col = 'rgba(46,96,40,0.55)';
    else col = 'rgba(130,180,80,0.35)';
    g.fillStyle = col;
    const s = 1 + rng() * 3;
    g.fillRect(x, y, s, s);
  }
  return canvasTex(c, 90, 90);
}

export function makeCurbTexture() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#e8e6e2'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d4343f'; g.fillRect(0, 0, 32, 64);
  g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 0, 64, 4);
  return canvasTex(c, 1, 1);
}

export function makeCheckerTexture() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const s = 32;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#14161b';
      g.fillRect(x * s, y * s, s, s);
    }
  }
  return canvasTex(c, 1, 1);
}

export function makeDashTexture() {
  const c = makeCanvas(32, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 32, 128);
  g.fillStyle = 'rgba(235,240,245,0.75)';
  g.fillRect(12, 6, 8, 70);
  return canvasTex(c, 1, 1);
}

export function makeWindowTexture(wallColor, litChance, seed, cols, rows) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const rng = mulberry32(seed);
  g.fillStyle = wallColor;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = 'rgba(255,255,255,' + (rng() * 0.03) + ')';
    g.fillRect(rng() * 256, rng() * 256, 2, 10);
  }
  const padX = 16, padY = 16;
  const cellW = (256 - padX * 2) / cols;
  const cellH = (256 - padY * 2) / rows;
  const winW = cellW * 0.62, winH = cellH * 0.56;
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const x = padX + rx * cellW + (cellW - winW) / 2;
      const y = padY + ry * cellH + (cellH - winH) / 2;
      const lit = rng() < litChance;
      if (lit) {
        const warm = rng();
        g.fillStyle = warm < 0.6 ? 'rgba(255,224,150,0.92)' : 'rgba(190,232,255,0.9)';
      } else {
        g.fillStyle = 'rgba(24,44,64,0.9)';
      }
      g.fillRect(x, y, winW, winH);
      g.strokeStyle = 'rgba(10,18,28,0.6)';
      g.lineWidth = 2;
      g.strokeRect(x, y, winW, winH);
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + winW / 2, y); g.lineTo(x + winW / 2, y + winH);
      g.stroke();
    }
  }
  return canvasTex(c, 1, 1);
}

export function makeCrowdTexture() {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#1a2230'; g.fillRect(0, 0, 256, 128);
  const rng = mulberry32(777);
  const palette = ['#ff5a7a', '#3ce8ff', '#b8ff45', '#ffb340', '#e8e8ff', '#ff7ad0', '#7a9cff'];
  for (let y = 8; y < 128; y += 11) {
    for (let x = 6; x < 256; x += 9) {
      if (rng() < 0.82) {
        g.fillStyle = palette[Math.floor(rng() * palette.length)];
        g.beginPath();
        g.ellipse(x + rng() * 3, y + rng() * 3, 3.1, 3.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return canvasTex(c, 1, 1);
}

export function makeTextTexture(text, opts) {
  opts = opts || {};
  const c = makeCanvas(opts.w || 512, opts.h || 128);
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#0c1826';
  g.fillRect(0, 0, c.width, c.height);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = 8;
    g.strokeRect(4, 4, c.width - 8, c.height - 8);
  }
  g.fillStyle = opts.fg || '#eaf6ff';
  g.font = '800 ' + (opts.size || Math.floor(c.height * 0.48)) + 'px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  const lh = (opts.size || c.height * 0.48) * 1.12;
  const startY = c.height / 2 - (lines.length - 1) * lh / 2;
  for (let i = 0; i < lines.length; i++) {
    g.fillText(lines[i], c.width / 2, startY + i * lh);
  }
  return canvasTex(c, 1, 1);
}

export function makeNumberTexture(num, color) {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(5,10,18,0.85)';
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 7;
  g.stroke();
  g.fillStyle = color;
  g.font = '800 66px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 64, 68);
  return canvasTex(c, 1, 1);
}

export function makeSkyTexture() {
  const c = makeCanvas(8, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#1a5fa0');
  grad.addColorStop(0.42, '#5ba6da');
  grad.addColorStop(0.72, '#a8d4ec');
  grad.addColorStop(0.9, '#dcecf4');
  grad.addColorStop(1.0, '#e7f0f3');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export function makeClockFaceTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#d9d2c4';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1a2430';
  g.beginPath();
  g.arc(128, 128, 96, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9a45a';
  g.lineWidth = 6;
  g.stroke();
  g.strokeStyle = '#e8eef5';
  g.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 78, 128 + Math.sin(a) * 78);
    g.lineTo(128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88);
    g.stroke();
  }
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(-Math.PI / 3) * 54, 128 + Math.sin(-Math.PI / 3) * 54);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(Math.PI * 0.7) * 70, 128 + Math.sin(Math.PI * 0.7) * 70);
  g.stroke();
  g.fillStyle = '#c9a45a';
  g.beginPath();
  g.arc(128, 128, 7, 0, Math.PI * 2);
  g.fill();
  return canvasTex(c, 1, 1);
}