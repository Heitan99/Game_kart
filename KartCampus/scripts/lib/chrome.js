/* =====================================================================
   KART CAMPUS — utilidad de Chrome headless vía CDP
   Abre una pestaña con control del protocolo DevTools, permite evaluar
   JavaScript, capturar pantallas y recoger errores de consola.
   ===================================================================== */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

export function findChrome() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('No se encontró Chrome/Edge (define CHROME_PATH)');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (res.ok) return await res.json();
    } catch (e) { /* aún no listo */ }
    await sleep(200);
  }
  throw new Error('El depurador de Chrome no respondió');
}

/**
 * Lanza Chrome headless, navega a `url` y ejecuta `fn({ send, evaluate, problems })`.
 * Devuelve el valor que retorne `fn`.
 */
export async function withPage(url, fn, options = {}) {
  const chrome = findChrome();
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = join(tmpdir(), 'kc-cdp-' + randomUUID());
  mkdirSync(profile, { recursive: true });

  const proc = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=' + (options.viewport || '1280,720'),
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: 'ignore' });

  const problems = [];
  let ws;
  try {
    await waitForDebugger(port);
    const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const page = list.find((t) => t.type === 'page') || list[0];
    if (!page || !page.webSocketDebuggerUrl) throw new Error('No hay pestaña depurable');

    ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    let msgId = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const text = d.exception ? (d.exception.description || d.exception.value) : d.text;
        problems.push('EXCEPCIÓN: ' + text);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        if (msg.params.type === 'error') {
          const parts = (msg.params.args || []).map((a) => a.value !== undefined ? a.value : a.description);
          problems.push('CONSOLA error: ' + parts.join(' '));
        }
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        if (e.level === 'error' && !/favicon/i.test(e.text || '')) problems.push('LOG error: ' + e.text);
      }
    });

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Page.navigate', { url });
    await sleep(options.settleMs !== undefined ? options.settleMs : 7000);

    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.text || 'error'));
      return r.result.value;
    };
    const screenshot = async (path) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(shot.data, 'base64');
    };

    return await fn({ send, evaluate, screenshot, problems });
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignorar */ }
    try { proc.kill(); } catch (e) { /* ignorar */ }
    await sleep(150);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignorar */ }
  }
}
