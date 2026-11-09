// Uses installed Chrome and native Node WebSocket; no npm/browser downloads.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('test-results');
await mkdir(root, { recursive:true });
const chrome = process.env.PWA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(chrome, ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=9229', `--user-data-dir=${root}/chrome-${Date.now()}`, 'about:blank'], { windowsHide:true, stdio:'ignore' });
let ws;
const sleep = ms => new Promise(r => setTimeout(r,ms));
async function until(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) { try { const v = await fn(); if(v) return v; } catch(e) { last = e; } await sleep(200); }
  throw last || Error('Timeout esperando condición del navegador.');
}
try {
  await until(async () => (await fetch('http://127.0.0.1:9229/json/version')).ok);
  const target = await (await fetch('http://127.0.0.1:9229/json/new?about:blank', { method:'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let next = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const send = (method, params = {}) => new Promise((resolve,reject) => { const id = ++next; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params})); });
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url:'http://localhost/PWA-Life/' });
  await until(() => evaluate(`typeof SyncEngine !== 'undefined' && SyncEngine.getStatus().available && !!navigator.serviceWorker.controller`));
  const stamp = Date.now();
  const title = `Browser ${stamp}`;
  await evaluate(`TaskManager.openTaskModal(); document.getElementById('task-title').value=${JSON.stringify(title)}; document.getElementById('task-description').value='Prueba real IndexedDB'; document.getElementById('task-form').requestSubmit();`);
  await until(() => evaluate(`TaskManager.getMetrics().tasks.some(t=>t.title===${JSON.stringify(title)}) && SyncEngine.getStatus().pending===0`));
  const taskId = await evaluate(`TaskManager.getMetrics().tasks.find(t=>t.title===${JSON.stringify(title)}).id`);
  await evaluate(`NotesManager.openNoteModal(); document.getElementById('note-title').value=${JSON.stringify(title)}; document.getElementById('note-content').value='Nota en navegador'; document.getElementById('note-form').requestSubmit();`);
  await until(() => evaluate(`NotesManager.getMetrics().notes.some(n=>n.title===${JSON.stringify(title)}) && SyncEngine.getStatus().pending===0`));
  await send('Page.reload');
  await until(() => evaluate(`typeof TaskManager !== 'undefined' && TaskManager.getMetrics().tasks.some(t=>t.id===${JSON.stringify(taskId)})`));
  await send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
  await evaluate(`TaskManager.toggleTaskStatus(${JSON.stringify(taskId)})`);
  await until(() => evaluate(`SyncEngine.getStatus().pending > 0`));
  await evaluate(`StorageEngine.saveNote({id:'note-offline-${stamp}', title:'Offline browser', content:'Pendiente real', category:'Ideas', colorTag:'#f59e0b', createdAt:new Date().toISOString()})`);
  await send('Page.reload');
  await until(() => evaluate(`typeof NotesManager !== 'undefined' && NotesManager.getMetrics().notes.some(n=>n.id==='note-offline-${stamp}')`));
  assert.equal(await evaluate(`TaskManager.getMetrics().tasks.find(t=>t.id===${JSON.stringify(taskId)}).completed`), true);
  await send('Network.emulateNetworkConditions', { offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1 });
  await evaluate('SyncEngine.sync()');
  await until(() => evaluate('SyncEngine.getStatus().available && SyncEngine.getStatus().pending===0'));
  const saved = await (await fetch(`http://localhost/PWA-Life/api/tasks/${taskId}`)).json();
  assert.equal(saved.data.completed, true);
  const offlineNote = await (await fetch(`http://localhost/PWA-Life/api/notes/note-offline-${stamp}`)).json();
  assert.equal(offlineNote.data.content, 'Pendiente real');
  const cachesClean = await evaluate(`(async()=>{for(const name of await caches.keys()){for(const r of await (await caches.open(name)).keys()){if(r.url.includes('/api/')||r.url.includes('/backend/'))return false;}}return true;})()`);
  assert.equal(cachesClean, true);
  const manifest = await send('Page.getAppManifest');
  assert.equal(manifest.errors.length, 0);
  for (const width of [375,768,1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width<500 });
    await sleep(200);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Overflow ${width}px`);
    const screenshot = await send('Page.captureScreenshot', { format:'png' });
    await writeFile(`${root}/pwa-${width}.png`, Buffer.from(screenshot.data,'base64'));
  }
  assert.deepEqual(errors, []);
  await send('Page.navigate', { url:'http://localhost/phpmyadmin/index.php?route=/sql&db=pwa_life_db&table=tasks&pos=0' });
  await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(taskId)})`));
  await writeFile(`${root}/phpmyadmin-tasks.png`, Buffer.from((await send('Page.captureScreenshot', { format:'png' })).data,'base64'));
  await send('Page.navigate', { url:'http://localhost/phpmyadmin/index.php?route=/sql&db=pwa_life_db&table=notes&pos=0' });
  await until(() => evaluate(`document.body.innerText.includes('note-offline-${stamp}')`));
  await writeFile(`${root}/phpmyadmin-notes.png`, Buffer.from((await send('Page.captureScreenshot', { format:'png' })).data,'base64'));
  const result = { taskId, offlineNoteId:`note-offline-${stamp}`, checks:['formularios tareas/notas','IndexedDB real','persistencia recarga','SW offline recarga','edición y creación offline','sincronización MySQL','Cache Storage sin API','manifest válido','sin desbordamiento 375/768/1440','sin excepciones JS','registros visibles en phpMyAdmin tasks/notes'], manual:['instalación nativa','reinicio Apache/MySQL'] };
  await writeFile(`${root}/browser-results.json`, JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  await send('Browser.close').catch(()=>{});
} finally { ws?.close(); child.kill(); }
