import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.PWA_TEST_URL || 'http://localhost/PWA-Life/';
let checks = 0;
async function call(path, method = 'GET', data, key = randomUUID(), expected = 200, extra = {}) {
  const r = await fetch(new URL('api/' + path, base), {
    method, headers: { 'Content-Type':'application/json', 'X-PWA-Request':'1', 'Idempotency-Key':key, ...extra },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  const body = await r.json();
  assert.equal(r.status, expected, JSON.stringify(body)); checks++;
  assert.match(r.headers.get('cache-control'), /no-store/);
  return body.data;
}
assert.equal((await call('health')).status, 'ok');
for (const type of ['tasks','notes']) {
  const id = 'test-' + randomUUID();
  const item = type === 'tasks' ? { id, title:'Prueba integración á 🧪', description:"Texto ' SQL <script> literal", priority:'alta', dueDate:'2026-11-08', completed:false }
    : { id, title:'Nota integración', content:'Contenido persistente ñ 🧪', category:'Académico', colorTag:'#3b82f6' };
  const key = randomUUID();
  const created = await call(type, 'POST', item, key, 201);
  const replay = await call(type, 'POST', item, key, 201);
  assert.deepEqual(replay, created);
  await call(type, 'POST', { ...item, title:'Distinto' }, key, 409);
  await call(type, 'POST', item, randomUUID(), 409);
  assert.equal((await call(type)).filter(r => r.id === id).length, 1);
  assert.equal((await call(type + '/' + id)).title, item.title);
  const edited = await call(type + '/' + id, 'PUT', { ...item, title:'Editado', revision:created.revision });
  await call(type + '/' + id, 'PUT', { ...item, revision:created.revision }, randomUUID(), 409);
  let revision = edited.revision;
  if (type === 'tasks') {
    revision = (await call(type + '/' + id, 'PATCH', { completed:true, revision })).revision;
    await call(type + '/' + id, 'PATCH', { dueDate:'2026-02-30', revision }, randomUUID(), 422);
    await call(type + '/' + id, 'PATCH', { completed:'false', revision }, randomUUID(), 422);
  }
  await call(type, 'POST', { ...item, id:'bad-' + randomUUID(), title:'' }, randomUUID(), 422);
  await call(type, 'POST', item, randomUUID(), 403, { Origin:'https://evil.example' });
  await call(type, 'POST', item, randomUUID(), 403, { 'X-PWA-Request':'' });
  await call(type + '/' + id, 'DELETE', { revision });
  await call(type + '/' + id, 'GET', undefined, undefined, 404);
  assert.ok(!(await call(type)).some(r => r.id === id));
  assert.ok((await call(type + '?include_deleted=1')).find(r => r.id === id).deletedAt);
  console.log(`${type}: CRUD, revisiones, Unicode, idempotencia, validación, CSRF y tombstone OK (${id})`);
}
for (const path of ['backend/config/database.local.php','database/pwa_life_db.sql','.git/config','scripts/import-database.php']) {
  const r = await fetch(new URL(path, base));
  assert.equal(r.status, 403, path); checks++;
}
console.log(`${checks} comprobaciones HTTP completadas. Los registros test-* quedan eliminados lógicamente para inspección en phpMyAdmin.`);
