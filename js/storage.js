/**
 * ==============================================================================
 * CAPA DE ALMACENAMIENTO LOCAL (STORAGE ENGINE) - PWA LIFE
 * ==============================================================================
 * 
 * Implementa persistencia local en el navegador utilizando IndexedDB como motor
 * primario asíncrono y de alto rendimiento, con degradación elegante a
 * localStorage en caso de incompatibilidad.
 * 
 * Cumple con el estándar offline: todos los datos creados se conservan en el
 * dispositivo sin depender de servidores remotos.
 * ==============================================================================
 */

const StorageEngine = (() => {
  const DB_NAME = 'pwa_life_database';
  const DB_VERSION = 1;
  const STORE_TASKS = 'tasks';
  const STORE_NOTES = 'notes';

  let dbInstance = null;
  let useFallback = false;

  /**
   * Inicializa la conexión con IndexedDB o configura el fallback.
   */
  async function init() {
    if (!('indexedDB' in window)) {
      console.warn('[Storage] IndexedDB no soportado en este navegador. Usando localStorage.');
      useFallback = true;
      _seedFallbackIfEmpty();
      return true;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[Storage] Creando o actualizando estructura de IndexedDB...');

        // Almacén de objetos para tareas
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          const taskStore = db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
          taskStore.createIndex('completed', 'completed', { unique: false });
          taskStore.createIndex('priority', 'priority', { unique: false });
          taskStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Almacén de objetos para notas
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          const noteStore = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
          noteStore.createIndex('category', 'category', { unique: false });
          noteStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        console.log('[Storage] Conexión establecida exitosamente con IndexedDB.');
        _seedInitialDataIfEmpty().then(() => resolve(true));
      };

      request.onerror = (event) => {
        console.error('[Storage] Error al abrir IndexedDB:', event.target.error);
        useFallback = true;
        _seedFallbackIfEmpty();
        resolve(false);
      };
    });
  }

  /**
   * Inserta datos de muestra académicos en IndexedDB si la base de datos está vacía.
   */
  async function _seedInitialDataIfEmpty() {
    const existingTasks = await getAll(STORE_TASKS);
    if (existingTasks.length === 0) {
      const sampleTasks = [
        {
          id: 'task-1',
          title: 'Verificar Web App Manifest en DevTools',
          description: 'Abrir pestaña Application > Manifest y comprobar iconos, orientación y modo standalone.',
          priority: 'alta',
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          completed: true,
          createdAt: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 'task-2',
          title: 'Demostrar funcionamiento Offline del Service Worker',
          description: 'Desconectar la red en Network > Throttling > Offline y recargar la aplicación.',
          priority: 'alta',
          dueDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
          completed: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'task-3',
          title: 'Probar instalación en escritorio o dispositivo móvil',
          description: 'Hacer clic en el botón Instalar Aplicación y comprobar la ventana independiente.',
          priority: 'media',
          dueDate: new Date(Date.now() + 259200000).toISOString().split('T')[0],
          completed: false,
          createdAt: new Date().toISOString()
        }
      ];

      for (const t of sampleTasks) {
        await save(STORE_TASKS, t);
      }
    }

    const existingNotes = await getAll(STORE_NOTES);
    if (existingNotes.length === 0) {
      const sampleNotes = [
        {
          id: 'note-1',
          title: 'Arquitectura PWA: Los 3 Pilares',
          content: '1. HTTPS: Comunicación segura obligatoria.\n2. Web App Manifest: Metadatos para instalación.\n3. Service Worker: Proxy local para caché y modo offline.',
          category: 'Académico',
          colorTag: '#3b82f6',
          createdAt: new Date().toISOString()
        },
        {
          id: 'note-2',
          title: 'Estrategia de Caché en PWA Life',
          content: 'Utilizamos Stale-While-Revalidate para recursos estáticos del App Shell y Network First para navegación, garantizando disponibilidad 100% offline.',
          category: 'Técnico',
          colorTag: '#10b981',
          createdAt: new Date().toISOString()
        }
      ];

      for (const n of sampleNotes) {
        await save(STORE_NOTES, n);
      }
    }
  }

  function _seedFallbackIfEmpty() {
    if (!localStorage.getItem('pwa_life_tasks')) {
      localStorage.setItem('pwa_life_tasks', JSON.stringify([]));
    }
    if (!localStorage.getItem('pwa_life_notes')) {
      localStorage.setItem('pwa_life_notes', JSON.stringify([]));
    }
  }

  /**
   * Operación genérica para obtener todos los registros de un almacén.
   */
  async function getAll(storeName) {
    if (useFallback || !dbInstance) {
      const data = localStorage.getItem(`pwa_life_${storeName}`);
      return data ? JSON.parse(data) : [];
    }

    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Operación genérica para guardar o actualizar un registro.
   */
  async function save(storeName, item) {
    if (useFallback || !dbInstance) {
      const items = await getAll(storeName);
      const index = items.findIndex((i) => i.id === item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
      localStorage.setItem(`pwa_life_${storeName}`, JSON.stringify(items));
      return item;
    }

    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Operación genérica para eliminar un registro por ID.
   */
  async function remove(storeName, id) {
    if (useFallback || !dbInstance) {
      const items = await getAll(storeName);
      const filtered = items.filter((i) => i.id !== id);
      localStorage.setItem(`pwa_life_${storeName}`, JSON.stringify(filtered));
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Métricas y diagnóstico del estado de almacenamiento para la pestaña técnica.
   */
  async function getDiagnostics() {
    const tasks = await getAll(STORE_TASKS);
    const notes = await getAll(STORE_NOTES);

    let quotaInfo = {
      supported: false,
      usageMB: '0.00',
      quotaMB: '0.00',
      percentUsed: '0.0%'
    };

    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
        const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(2);
        const percent = ((estimate.usage / estimate.quota) * 100).toFixed(2);

        quotaInfo = {
          supported: true,
          usageMB,
          quotaMB,
          percentUsed: `${percent}%`
        };
      } catch (e) {
        console.warn('Error al estimar cuota de almacenamiento:', e);
      }
    }

    return {
      engine: useFallback ? 'localStorage' : 'IndexedDB',
      databaseName: DB_NAME,
      taskCount: tasks.length,
      noteCount: notes.length,
      quotaInfo
    };
  }

  // API pública
  return {
    init,
    // Tareas
    getTasks: () => getAll(STORE_TASKS),
    saveTask: (task) => save(STORE_TASKS, task),
    deleteTask: (id) => remove(STORE_TASKS, id),
    // Notas
    getNotes: () => getAll(STORE_NOTES),
    saveNote: (note) => save(STORE_NOTES, note),
    deleteNote: (id) => remove(STORE_NOTES, id),
    // Diagnósticos
    getDiagnostics
  };
})();
