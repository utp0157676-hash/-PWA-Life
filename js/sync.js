/* Durable outbox embedded in each local record: data + queue commit together.
 * Web Locks serializes mutations/pulls/acks across tabs. No silent conflict overwrite.
 */
const SyncEngine = (() => {
  let running = false;
  let timer;
  let delay = 15000;
  let started = false;
  let status = { available: false, pending: 0, conflicts: 0, message: 'Comprobando servidor…' };
  const fields = {
    tasks: ['id','title','description','priority','dueDate','completed','createdAt','updatedAt','dueTime','dueAt','timeZone','reminderMinutes','notificationsEnabled','snoozedUntil'],
    notes: ['id','title','content','category','colorTag','createdAt','updatedAt']
  };
  const token = () => crypto.randomUUID();
  const clean = (type, row) => Object.fromEntries(fields[type].filter(k => row[k] !== undefined).map(k => [k, row[k]]));
  async function lock(fn) {
    if (!navigator.locks) throw new Error('La sincronización segura requiere Chrome/Edge actualizado y localhost o HTTPS.');
    return navigator.locks.request('pwa-life-data', fn);
  }
  function announce(message) {
    status.message = message;
    window.dispatchEvent(new CustomEvent('sync-status', { detail: { ...status } }));
  }
  async function counts() {
    const rows = [...await StorageEngine.rawAll('tasks'), ...await StorageEngine.rawAll('notes')];
    status.pending = rows.reduce((n, r) => n + (r._outbox?.length || 0), 0);
    status.conflicts = rows.filter(r => r._syncError).length;
  }
  async function mutate(type, data, deleted = false) {
    await lock(async () => {
      const old = (await StorageEngine.rawAll(type)).find(r => r.id === data.id);
      if (old?._syncError && ![400,413,422].includes(old._syncErrorStatus)) throw new Error('Resuelve primero el conflicto desde el indicador de sincronización.');
      if (deleted && !old) return;
      const row = { ...(old || {}), ...data };
      const correcting = !!old?._syncError;
      const queue = correcting ? [] : [...(old?._outbox || [])];
      // Legacy records must first be imported without overwriting an existing server ID.
      if (old && !old._synced && !queue.length && !correcting) queue.push({ token: token(), method: 'POST', data: clean(type, old) });
      if (correcting && deleted && !old._synced) { await StorageEngine.rawRemove(type, old.id); return; }
      const method = deleted ? 'DELETE' : (!old?._synced && !queue.length ? 'POST' : 'PUT');
      queue.push({ token: token(), method, data: deleted ? {} : clean(type, row) });
      await StorageEngine.rawSave(type, { ...row, _deleted: deleted, _outbox: queue, _syncError: null, _syncErrorStatus: null });
      await counts();
      announce('Guardado en este dispositivo; pendiente de confirmar en MySQL.');
    });
    window.dispatchEvent(new Event('tasks-changed'));
    void sync();
  }
  async function cycle() {
    await LifeAPI.request('health');
    status.available = true;
    for (const type of ['tasks','notes']) {
      for (let row of await StorageEngine.rawAll(type)) {
        if (!row._synced && !row._outbox?.length) {
          row = { ...row, _outbox: [{ token: token(), method: 'POST', data: clean(type, row) }] };
          await StorageEngine.rawSave(type, row);
        }
        if (row._syncError) continue;
        while (row._outbox?.length) {
          let op = row._outbox[0];
          // Persist the exact request before sending: a lost response replays identical bytes.
          if (!op.request) {
            op = { ...op, request: { ...op.data, ...(op.method === 'POST' ? {} : { revision: row.revision }) } };
            row._outbox[0] = op;
            await StorageEngine.rawSave(type, row);
          }
          let confirmed;
          try {
            confirmed = await LifeAPI.request(type + (op.method === 'POST' ? '' : '/' + encodeURIComponent(row.id)), op.method, op.request, op.token);
          } catch (error) {
            if ([400,404,409,413,422].includes(error.status)) {
              row._syncError = error.message;
              row._syncErrorStatus = error.status;
              await StorageEngine.rawSave(type, row);
              break;
            }
            throw error;
          }
          const rest = row._outbox.slice(1);
          row = rest.length ? { ...row, revision: confirmed.revision, _synced: true, _outbox: rest }
            : { ...confirmed, _synced: true, _deleted: !!confirmed.deletedAt, _outbox: [] };
          await StorageEngine.rawSave(type, row);
        }
      }
      const remote = await LifeAPI.request(type + '?include_deleted=1');
      if (!Array.isArray(remote)) throw new Error('Lista de servidor inválida.');
      const local = new Map((await StorageEngine.rawAll(type)).map(r => [r.id, r]));
      for (const row of remote) {
        const own = local.get(row.id);
        if (own?._outbox?.length || own?._syncError) continue;
        await StorageEngine.rawSave(type, { ...row, _synced: true, _deleted: !!row.deletedAt, _outbox: [] });
      }
      // Never infer deletion from absence: only explicit server tombstones remove data.
    }
  }
  async function sync() {
    if (!started || running) return;
    running = true;
    clearTimeout(timer);
    try {
      await lock(cycle);
      delay = 15000;
      await counts();
      announce(status.conflicts ? 'Hay conflictos conservados. Usa «Resolver» para guardar copias.' : 'Cambios confirmados en MySQL.');
    } catch (error) {
      status.available = false;
      delay = Math.min(delay * 2, 60000);
      await counts().catch(() => {});
      announce('Servidor no disponible; cambios conservados localmente. ' + error.message);
    } finally {
      running = false;
      window.dispatchEvent(new Event('data-synced'));
      timer = setTimeout(sync, delay);
    }
  }
  async function resolveCopies() {
    // Explicit user choice. Preserve conflicting content under a fresh ID; never
    // overwrite the remote version. A failed second write leaves an extra local copy.
    await lock(async () => {
      for (const type of ['tasks','notes']) {
        const remote = await LifeAPI.request(type + '?include_deleted=1');
        for (const row of await StorageEngine.rawAll(type)) {
          if (!row._syncError) continue;
          if (!row._deleted) {
            const copy = { ...clean(type, row), id: (type === 'tasks' ? 'task-' : 'note-') + token() };
            await StorageEngine.rawSave(type, { ...copy, _outbox: [{ token: token(), method: 'POST', data: copy }] });
          }
          const confirmed = remote.find(r => r.id === row.id);
          if (confirmed) await StorageEngine.rawSave(type, { ...confirmed, _synced: true, _deleted: !!confirmed.deletedAt, _outbox: [] });
          else await StorageEngine.rawRemove(type, row.id);
        }
      }
    });
    return sync();
  }
  function start() {
    if (started) return;
    started = true;
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('offline', () => { status.available = false; announce('Sin red; cambios guardados en este dispositivo.'); });
    void sync();
  }
  async function importBackup(backup) {
    if (!backup || !Array.isArray(backup.tasks) || !Array.isArray(backup.notes)) throw new Error('El respaldo requiere arrays tasks y notes.');
    let imported = 0;
    await lock(async () => {
      for (const type of ['tasks','notes']) {
        const existing = new Set((await StorageEngine.rawAll(type)).map(r => r.id));
        for (const record of backup[type]) {
          if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(record.id) || typeof record.title !== 'string' || (type === 'notes' && typeof record.content !== 'string')) throw new Error('Registro inválido; los registros ya importados se conservan.');
          if (existing.has(record.id) || record._deleted || record.deletedAt) continue;
          const row = clean(type, record);
          await StorageEngine.rawSave(type, { ...row, _outbox: [{ token: token(), method: 'POST', data: row }] });
          existing.add(row.id); imported++;
        }
      }
    });
    void sync();
    return imported;
  }
  return { start, sync, mutate, resolveCopies, importBackup, getStatus: () => ({ ...status }) };
})();
