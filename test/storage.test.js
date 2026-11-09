const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'js', 'storage.js'), 'utf8');

function createEngine({ indexedDB, localStorage = new Map(), failWrites = false } = {}) {
  const storage = {
    getItem(key) { return localStorage.has(key) ? localStorage.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('Quota excedida');
      localStorage.set(key, String(value));
    }
  };
  const context = {
    window: { indexedDB, localStorage: storage },
    navigator: {},
    console,
    Promise,
    Error,
    TypeError,
    JSON
  };
  vm.runInNewContext(`${source}\nthis.engine = StorageEngine;`, context);
  return { engine: context.engine, localStorage };
}

function createIndexedDB() {
  const stores = new Map();
  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) {
      const records = new Map();
      stores.set(name, records);
      return { createIndex() {} };
    },
    transaction(name) {
      const tx = { error: null };
      tx.objectStore = () => ({
        getAll() {
          const request = {};
          queueMicrotask(() => {
            request.result = [...stores.get(name).values()];
            request.onsuccess?.();
            tx.oncomplete?.();
          });
          return request;
        },
        put(item) {
          queueMicrotask(() => { stores.get(name).set(item.id, item); tx.oncomplete?.(); });
        },
        delete(id) {
          queueMicrotask(() => { stores.get(name).delete(id); tx.oncomplete?.(); });
        }
      });
      return tx;
    }
  };
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.({ target: { result: db } });
        request.onsuccess?.({ target: { result: db } });
      });
      return request;
    }
  };
}

test('localStorage fallback supports task and note CRUD and keeps IDs', async () => {
  const { engine, localStorage } = createEngine();
  assert.equal((await engine.init()).engine, 'localStorage');
  const task = { id: 'task-a', title: 'Original', completed: false };
  const note = { id: 'note-a', title: 'Nota', content: 'Texto' };
  await engine.saveTask(task);
  await engine.saveNote(note);
  assert.deepEqual(JSON.parse(localStorage.get('pwa_life_tasks')), [task]);
  assert.deepEqual(JSON.parse(localStorage.get('pwa_life_notes')), [note]);
  await engine.saveTask({ ...task, title: 'Editada' });
  assert.equal((await engine.getTasks()).length, 1);
  assert.equal((await engine.getTasks())[0].id, 'task-a');
  assert.equal((await engine.getTasks())[0].title, 'Editada');
  await engine.deleteTask('task-a');
  await engine.deleteNote('note-a');
  assert.equal((await engine.getTasks()).length, 0);
  assert.equal((await engine.getNotes()).length, 0);
});

test('IndexedDB primary path supports CRUD and waits for transaction completion', async () => {
  const { engine } = createEngine({ indexedDB: createIndexedDB() });
  assert.equal((await engine.init()).engine, 'IndexedDB');
  await engine.saveTask({ id: 'task-idb', title: 'Nueva' });
  await engine.saveNote({ id: 'note-idb', title: 'Nueva', content: 'Texto' });
  assert.equal((await engine.getTasks())[0].title, 'Nueva');
  assert.equal((await engine.getNotes())[0].content, 'Texto');
  await engine.saveTask({ id: 'task-idb', title: 'Editada' });
  assert.equal((await engine.getTasks()).length, 1);
  assert.equal((await engine.getTasks())[0].title, 'Editada');
  await engine.deleteTask('task-idb');
  await engine.deleteNote('note-idb');
  assert.equal((await engine.getTasks()).length, 0);
  assert.equal((await engine.getNotes()).length, 0);
});

test('fallback reports malformed data instead of treating it as an empty store', async () => {
  const { engine } = createEngine({ localStorage: new Map([['pwa_life_tasks', '{bad json']]) });
  await engine.init();
  await assert.rejects(engine.getTasks(), /No se pudieron leer/);
});

test('storage write errors reject instead of reporting success', async () => {
  const engine = createEngine({ failWrites: true }).engine;
  await engine.init();
  await assert.rejects(engine.saveTask({ id: 'task-a', title: 'No guardar' }), /Quota excedida/);
});

test('initialization does not create demo records', async () => {
  const { engine, localStorage } = createEngine();
  await engine.init();
  assert.equal(localStorage.has('pwa_life_tasks'), false);
  assert.equal(localStorage.has('pwa_life_notes'), false);
  assert.equal((await engine.getTasks()).length, 0);
  assert.equal((await engine.getNotes()).length, 0);
});
