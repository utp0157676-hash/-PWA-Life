const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = ['storage','sync'].map(n => fs.readFileSync(`${__dirname}/../js/${n}.js`, 'utf8')).join('\n');
function setup(disk = new Map(), server = { tasks:new Map(), notes:new Map(), ledger:new Map() }) {
  let offline = false, loseResponse = false, writesFail = false, finished;
  let serial = Promise.resolve();
  const listeners = {};
  const window = {
    localStorage: { getItem:k => disk.get(k) ?? null, setItem:(k,v) => { if (writesFail) throw Error('Quota'); disk.set(k,v); } },
    addEventListener:(name, cb) => { (listeners[name] ||= []).push(cb); },
    dispatchEvent:e => { for (const cb of listeners[e.type] || []) cb(e); if (e.type === 'data-synced') finished?.(); }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const api = async (path, method = 'GET', data, key) => {
    if (offline) throw Error('Backend apagado');
    if (path === 'health') return { status:'ok' };
    const [type,id] = path.split('?')[0].split('/');
    if (method === 'GET') return clone([...server[type].values()]);
    if (server.ledger.has(key)) return clone(server.ledger.get(key));
    const old = server[type].get(id || data.id);
    if ((method === 'POST' && old) || (method !== 'POST' && data.revision !== old?.revision)) throw Object.assign(Error('Conflicto'), { status:409 });
    const row = method === 'DELETE' ? { ...old, deletedAt:'2026-11-08T00:00:00Z' } : { ...old, ...data };
    row.revision = (old?.revision || 0) + 1;
    server[type].set(row.id, clone(row)); server.ledger.set(key, clone(row));
    if (loseResponse) { loseResponse = false; throw Error('Respuesta perdida después del commit'); }
    return clone(row);
  };
  const context = {
    window, navigator:{ locks:{ request:(_name,fn) => { const result = serial.then(fn); serial = result.catch(() => {}); return result; } } },
    LifeAPI:{ request:api }, crypto:{ randomUUID }, console:{ info(){}, warn(){} },
    setTimeout:() => 1, clearTimeout(){}, Event:class { constructor(type){ this.type = type; } },
    CustomEvent:class { constructor(type, options){ this.type = type; this.detail = options.detail; } }
  };
  vm.runInNewContext(source + '\nthis.storage = StorageEngine; this.sync = SyncEngine;', context);
  return { disk, server, storage:context.storage, sync:context.sync,
    offline:v => { offline = v; }, lose:() => { loseResponse = true; }, fail:() => { writesFail = true; },
    async start() { const done = new Promise(r => { finished = r; }); context.sync.start(); await done; }
  };
}
const task = { id:'task-stable', title:'Original', description:'', priority:'media', completed:false, dueDate:null };
test('durable offline create/edit survives reload and syncs with one stable ID', async () => {
  const a = setup(); await a.storage.init();
  await a.storage.saveTask(task); await a.storage.saveTask({ ...task, title:'Editada' });
  assert.equal((await a.storage.rawAll('tasks'))[0]._outbox.length, 2);
  const b = setup(a.disk, a.server); await b.storage.init(); await b.start();
  assert.equal(b.server.tasks.size, 1); assert.equal(b.server.tasks.get(task.id).title, 'Editada');
  assert.equal((await b.storage.rawAll('tasks'))[0]._outbox.length, 0);
});
test('lost response after commit is replayed without duplicate or extra revision', async () => {
  const a = setup(); await a.storage.init(); await a.storage.saveTask(task); a.lose(); await a.start();
  assert.equal(a.server.tasks.size, 1); assert.equal((await a.storage.rawAll('tasks'))[0]._outbox.length, 1);
  const b = setup(a.disk, a.server); await b.storage.init(); await b.start();
  assert.equal(b.server.tasks.get(task.id).revision, 1); assert.equal(b.sync.getStatus().pending, 0);
});
test('offline delete stays a tombstone until MySQL confirmation', async () => {
  const a = setup(); await a.storage.init(); await a.storage.saveTask(task); await a.storage.deleteTask(task.id);
  assert.equal((await a.storage.getTasks()).length, 0); assert.equal((await a.storage.rawAll('tasks'))[0]._outbox.length, 2);
  await a.start(); assert.ok(a.server.tasks.get(task.id).deletedAt); assert.equal(a.sync.getStatus().pending, 0);
});
test('internet with backend down retains pending changes and later recovers', async () => {
  const a = setup(); await a.storage.init(); await a.storage.saveTask(task); a.offline(true); await a.start();
  assert.equal(a.sync.getStatus().available, false); assert.equal(a.sync.getStatus().pending, 1);
  a.offline(false); await a.sync.sync(); assert.equal(a.sync.getStatus().pending, 0);
});
test('legacy records are imported without replacing colliding remote IDs', async () => {
  const disk = new Map([['pwa_life_tasks', JSON.stringify([task])]]);
  const a = setup(disk); a.server.tasks.set(task.id, { ...task, title:'Remoto', revision:1 });
  await a.storage.init(); await a.start();
  assert.equal(a.server.tasks.get(task.id).title, 'Remoto');
  assert.equal((await a.storage.getTasks())[0].title, 'Original');
  assert.equal(a.sync.getStatus().conflicts, 1);
  await a.sync.resolveCopies();
  assert.equal(a.server.tasks.size, 2); assert.equal(a.sync.getStatus().conflicts, 0);
});
test('revision conflict preserves local edit; explicit resolution stores a copy', async () => {
  const a = setup(); await a.storage.init(); await a.storage.rawSave('tasks', { ...task, revision:1, _synced:true });
  a.server.tasks.set(task.id, { ...task, title:'Cambio remoto', revision:2 });
  await a.storage.saveTask({ ...task, title:'Cambio local' }); await a.start();
  assert.equal(a.sync.getStatus().conflicts, 1); assert.equal((await a.storage.getTasks())[0].title, 'Cambio local');
  await a.sync.resolveCopies(); assert.equal(a.server.tasks.size, 2);
});
test('remote tombstones propagate, unknown local records never disappear on pull', async () => {
  const a = setup(); await a.storage.init();
  await a.storage.rawSave('tasks', { ...task, _synced:true, revision:1 });
  a.server.tasks.set(task.id, { ...task, deletedAt:'2026-11-08T00:00:00Z', revision:2 });
  await a.start(); assert.equal((await a.storage.getTasks()).length, 0);
});
test('failed local write does not send or falsely enqueue a mutation', async () => {
  const a = setup(); await a.storage.init(); a.fail();
  await assert.rejects(a.storage.saveTask(task), /Quota/);
  assert.equal(a.disk.size, 0); assert.equal(a.server.tasks.size, 0);
});
test('notes use the same durable protocol and preserve content', async () => {
  const a = setup(); await a.storage.init();
  await a.storage.saveNote({ id:'note-stable', title:'Nota', content:'Ñ <script> texto', category:'Ideas', colorTag:'#f59e0b' });
  await a.start(); assert.equal(a.server.notes.get('note-stable').content, 'Ñ <script> texto');
});

test('backup import keeps stable IDs and never overwrites local records', async () => {
  const a = setup(); await a.storage.init();
  await a.storage.saveTask(task);
  assert.equal(await a.sync.importBackup({ tasks:[{ ...task, title:'No reemplazar' }, { ...task, id:'task-import' }], notes:[] }), 1);
  assert.equal((await a.storage.getTasks()).find(r=>r.id===task.id).title, task.title);
  await a.start(); assert.equal(a.server.tasks.size, 2);
  assert.equal(await a.sync.importBackup({ tasks:[task], notes:[] }), 0);
});

test('confirmed validation rejection can be corrected without replaying bad data', async () => {
  const a = setup(); await a.storage.init();
  await a.storage.rawSave('tasks', { ...task, title:'', _syncError:'Título vacío', _syncErrorStatus:422, _outbox:[{token:'invalid',method:'POST',data:{...task,title:''}}] });
  await a.storage.saveTask({ ...task, title:'Corregida' });
  assert.equal((await a.storage.rawAll('tasks'))[0]._outbox.length, 1);
  await a.start(); assert.equal(a.server.tasks.get(task.id).title, 'Corregida');
});
