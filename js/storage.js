/** Local persistence: IndexedDB first, localStorage only when IDB cannot open. */
const StorageEngine = (() => {
  const DB_NAME = 'pwa_life_database';
  const DB_VERSION = 1;
  const STORE_TASKS = 'tasks';
  const STORE_NOTES = 'notes';
  let dbInstance = null;
  let engine = 'uninitialized';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      let request;
      try { request = window.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { reject(error); return; }

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          const store = db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
          store.createIndex('completed', 'completed', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          const store = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB está bloqueada por otra pestaña.'));
    });
  }

  function checkFallback() {
    // Accessing localStorage may itself throw (for example, in a restricted context).
    window.localStorage.getItem('pwa_life_tasks');
    engine = 'localStorage';
  }

  async function init() {
    if (engine !== 'uninitialized') return { engine };
    if (!window.indexedDB) {
      checkFallback();
      console.warn('[Storage] IndexedDB no disponible; usando localStorage.');
      return { engine };
    }
    try {
      dbInstance = await openDatabase();
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      engine = 'IndexedDB';
      console.info(`[Storage] Conectado a ${DB_NAME} (versión ${DB_VERSION}).`);
      return { engine };
    } catch (error) {
      // Do not copy data between stores implicitly. Switching stores is explicitly
      // reported in diagnostics because each backend may contain different records.
      try { checkFallback(); }
      catch (fallbackError) {
        throw new Error(`IndexedDB no está disponible (${error.message}) y localStorage tampoco (${fallbackError.message}).`);
      }
      console.warn('[Storage] IndexedDB no se pudo abrir; usando localStorage sin migrar datos.', error);
      return { engine, warning: error.message };
    }
  }

  function assertReady() {
    if (engine === 'uninitialized') throw new Error('El almacenamiento aún no está inicializado.');
  }

  function getAll(storeName) {
    assertReady();
    if (engine === 'localStorage') {
      const raw = window.localStorage.getItem(`pwa_life_${storeName}`);
      if (raw === null) return Promise.resolve([]);
      try {
        const records = JSON.parse(raw);
        if (!Array.isArray(records)) throw new Error('El contenido almacenado no es una lista.');
        return Promise.resolve(records);
      } catch (error) {
        return Promise.reject(new Error(`No se pudieron leer los ${storeName} de localStorage: ${error.message}`));
      }
    }
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = dbInstance.transaction(storeName, 'readonly'); }
      catch (error) { reject(error); return; }
      const request = tx.objectStore(storeName).getAll();
      let records;
      request.onsuccess = () => { records = request.result || []; };
      tx.oncomplete = () => resolve(records || []);
      tx.onerror = () => reject(tx.error || request.error || new Error('Falló la lectura de IndexedDB.'));
      tx.onabort = () => reject(tx.error || new Error('La lectura de IndexedDB fue cancelada.'));
    });
  }

  function save(storeName, item) {
    assertReady();
    if (!item || (typeof item.id !== 'string' && typeof item.id !== 'number')) {
      return Promise.reject(new TypeError('El registro debe tener un identificador válido.'));
    }
    if (engine === 'localStorage') {
      return getAll(storeName).then((items) => {
        const index = items.findIndex((record) => record.id === item.id);
        if (index < 0) items.push(item);
        else items[index] = item;
        window.localStorage.setItem(`pwa_life_${storeName}`, JSON.stringify(items));
        return item;
      });
    }
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = dbInstance.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(item);
      } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error || new Error('Falló la escritura en IndexedDB.'));
      tx.onabort = () => reject(tx.error || new Error('La escritura en IndexedDB fue cancelada.'));
    });
  }

  function remove(storeName, id) {
    assertReady();
    if (engine === 'localStorage') {
      return getAll(storeName).then((items) => {
        window.localStorage.setItem(`pwa_life_${storeName}`, JSON.stringify(items.filter((item) => item.id !== id)));
        return true;
      });
    }
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = dbInstance.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Falló la eliminación en IndexedDB.'));
      tx.onabort = () => reject(tx.error || new Error('La eliminación en IndexedDB fue cancelada.'));
    });
  }

  async function getDiagnostics() {
    assertReady();
    const [tasks, notes] = await Promise.all([getAll(STORE_TASKS), getAll(STORE_NOTES)]);
    let quotaInfo = { supported: false, usageMB: '0.00', quotaMB: '0.00', percentUsed: '0.0%' };
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        quotaInfo = {
          supported: true,
          usageMB: (usage / 1048576).toFixed(2),
          quotaMB: (quota / 1048576).toFixed(2),
          percentUsed: quota ? `${((usage / quota) * 100).toFixed(2)}%` : 'No disponible'
        };
      } catch (error) { console.warn('[Storage] No se pudo estimar la cuota:', error); }
    }
    return { engine, databaseName: engine === 'IndexedDB' ? DB_NAME : null, taskCount: tasks.filter(r => !r._deleted && !r.deletedAt).length, noteCount: notes.filter(r => !r._deleted && !r.deletedAt).length, quotaInfo };
  }

  return {
    init,
    rawAll: getAll, rawSave: save, rawRemove: remove,
    getTasks: async () => (await getAll(STORE_TASKS)).filter(r => !r._deleted && !r.deletedAt),
    saveTask: (task) => typeof SyncEngine === 'undefined' ? save(STORE_TASKS, task) : SyncEngine.mutate(STORE_TASKS, task),
    deleteTask: (id) => typeof SyncEngine === 'undefined' ? remove(STORE_TASKS, id) : SyncEngine.mutate(STORE_TASKS, { id }, true),
    getNotes: async () => (await getAll(STORE_NOTES)).filter(r => !r._deleted && !r.deletedAt),
    saveNote: (note) => typeof SyncEngine === 'undefined' ? save(STORE_NOTES, note) : SyncEngine.mutate(STORE_NOTES, note),
    deleteNote: (id) => typeof SyncEngine === 'undefined' ? remove(STORE_NOTES, id) : SyncEngine.mutate(STORE_NOTES, { id }, true),
    getDiagnostics
  };
})();
