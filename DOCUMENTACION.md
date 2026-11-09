# Documentación técnica – PWA Life

## 1. Análisis del proyecto original

La aplicación existente utiliza módulos reveladores sin dependencias de frontend. `index.html` contiene la navegación SPA, Dashboard, formularios y modales. `app.js` coordina gestores, métricas y navegación; `tasks.js` y `notes.js` consultan StorageEngine; `storage.js` usa IndexedDB `pwa_life_database` versión 1 y localStorage si IndexedDB no abre. `pwa.js` registra el SW y administra instalación y diagnóstico. `sw.js` almacena el shell. Manifest y recursos ya usan rutas relativas. `server.js` era un servidor estático Node, sin API. Se conservaron las modificaciones locales existentes a persistencia y pruebas; no se agregaron datos de demostración.

## 2. Arquitectura y estructura

```text
backend/
  index.php                    entrada, seguridad HTTP, rutas, errores
  config/database.php          conexión PDO y configuración
  config/database.example.php  ejemplo sin secretos reales
  controllers/RecordController.php  CRUD común e idempotencia
  models/Record.php            consultas parametrizadas, mapeo JSON/SQL
  helpers/Response.php         JSON y errores HTTP
  helpers/Validator.php        tipos, longitudes, fechas, prioridades, IDs
  .htaccess                   protección de archivos internos
database/pwa_life_db.sql        esquema importable, sin DROP/TRUNCATE
js/api.js                      Fetch, timeout 8 s, misma procedencia
js/sync.js                     cola, reintentos, revisiones y conflictos
js/storage.js                  IndexedDB y fallback localStorage
js/tasks.js, notes.js, app.js   UI existente e integración
js/pwa.js                      instalación y disponibilidad del servidor
sw.js, manifest.json           shell offline y metadatos de instalación
scripts/install-xampp.ps1       instalación Windows verificable
scripts/import-database.php    importación exclusivamente CLI
scripts/verify-api.mjs          integración HTTP sobre MySQL real
test/storage.test.js            pruebas previas de almacenamiento
test/sync.test.js               pruebas del protocolo persistente
.htaccess                      rutas relativas API y protección
```

El controlador y modelo compartidos evitan duplicar tareas/notas. La tabla se elige únicamente desde una lista interna. El navegador no accede directamente a MySQL. No hay dependencias Composer ni necesidad de Node para ejecutar PHP.

## 3. Instalación y configuración

Sigue los siete pasos del README. Ruta física: `C:\xampp\htdocs\PWA-Life`; URL: `http://localhost/PWA-Life/`. Inicia Apache/MySQL y usa phpMyAdmin para importar `database/pwa_life_db.sql`. El instalador automatiza estos pasos sin borrar datos. No modifica configuraciones globales de Apache.

Configura `backend/config/database.local.php` copiando el ejemplo. Variables de entorno equivalentes: `PWA_HOST`, `PWA_PORT`, `PWA_NAME`, `PWA_USER`, `PWA_PASSWORD`, `PWA_ORIGIN`; prevalecen sobre el archivo. Se requieren PDO MySQL y mbstring. Origin incluye esquema y puerto, sin ruta. Para errores 503 consulta logs de Apache/PHP; las respuestas no muestran contraseñas ni excepciones internas. Un 404 en /api/health puede indicar mod_rewrite/AllowOverride incorrectos. El instalador no cambia credenciales existentes.

## 4. Base de datos

Base `pwa_life_db`, utf8mb4, InnoDB. IDs VARCHAR(100) con comparación binaria, compatibles con `task-*`, `note-*` y UUID; no se regeneran al sincronizar.

| Tabla | Campos |
| --- | --- |
| tasks | id PK, title VARCHAR(255), description TEXT, priority ENUM(alta/media/baja), due_date DATE NULL, completed BOOLEAN DEFAULT FALSE, created_at/updated_at DATETIME, deleted_at DATETIME NULL, revision BIGINT |
| notes | id PK, title VARCHAR(255), content TEXT, category VARCHAR(100), color_tag VARCHAR(20), created_at/updated_at DATETIME, deleted_at DATETIME NULL, revision BIGINT |
| sync_operations | id PK (clave de operación), request_hash SHA-256, response_json, status_code, created_at |

Índices: tareas por eliminación/estado/vencimiento y prioridad; notas por eliminación/actualización y categoría. Fechas servidor UTC; la fecha original de creación se conserva al importar. Cada actualización aumenta revision. `updated_at` lo decide el servidor. No purgar tombstones ni ledger mientras haya clientes con operaciones pendientes. El SQL no modifica tablas incompatibles existentes: si ya tenías otro esquema debes respaldarlo y preparar una migración explícita.

## 5. Contrato REST

GET `/api/health` verifica PDO y las tres tablas. GET `/api/tasks` y `/api/notes` lista activos; GET `/{id}` retorna 404 si no existe o fue eliminado. `?include_deleted=1` incluye tombstones. POST crea, PUT reemplaza campos editables, PATCH tasks modifica únicamente los campos enviados. DELETE requiere revisión y marca deleted_at. PUT no crea IDs inexistentes.

Todas las respuestas usan JSON y Cache-Control no-store. Éxito: `{"data": ...}`. Error: `{"error":{"message":"..."}}`. Códigos: 200 consulta/edición/eliminación/reintento, 201 creación (también su replay), 400 JSON inválido, 403 origen/cabecera prohibidos, 404 ruta/registro inexistente, 405 método no admitido, 409 conflicto, 413 cuerpo excesivo, 415 tipo de contenido, 422 validación, 503 servicio no disponible.

Ejemplo PowerShell:

```powershell
$headers = @{ 'X-PWA-Request'='1'; 'Idempotency-Key'=[guid]::NewGuid().ToString() }
$body = @{ id=('task-' + [guid]::NewGuid()); title='Entregar proyecto'; description='Revisar API'; priority='alta'; dueDate='2026-11-20'; completed=$false } | ConvertTo-Json
$result = Invoke-RestMethod -Uri 'http://localhost/PWA-Life/api/tasks' -Method Post -ContentType 'application/json' -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body))
$result.data
```

Respuesta (fechas ilustrativas):

```json
{"data":{"id":"task-ejemplo","title":"Entregar proyecto","description":"Revisar API","priority":"alta","dueDate":"2026-11-20","completed":false,"createdAt":"2026-11-08T12:00:00Z","updatedAt":"2026-11-08T12:00:00Z","deletedAt":null,"revision":1}}
```

PATCH `/api/tasks/task-ejemplo`: `{"completed":true,"revision":1}`. DELETE: `{"revision":2}`. POST `/api/notes`: `{"id":"note-ejemplo","title":"Apuntes","content":"Contenido de la clase","category":"Académico","colorTag":"#3b82f6"}`. PUT nota incluye título, contenido y revisión vigente; categoría/color son opcionales y toman valores predeterminados. Cada nueva mutación lleva nueva Idempotency-Key; un reintento debe conservar clave, método, ruta y cuerpo exactos. No enviar campos internos `_outbox` ni `_synced` a la API.

## 6. Offline, atomicidad e idempotencia

Se mantienen los stores tasks/notes sin borrar ni actualizar la versión de IndexedDB. Cada registro contiene su cola `_outbox`; dato y cola se confirman con un único put. La eliminación deja `_deleted` y operación DELETE persistente. Un fallo de escritura local rechaza la acción; nunca se considera guardada. Fallback localStorage guarda un array completo por store; Web Locks coordina escrituras entre pestañas. Chrome/Edge moderno y contexto seguro son necesarios; si falta Web Locks la mutación se rechaza explícitamente.

La sincronización adquiere el mismo bloqueo, comprueba health, importa registros antiguos, procesa operaciones de cada registro en orden y descarga estado confirmado con eliminados. Guarda el cuerpo exacto antes de enviarlo y solo retira una operación después de una respuesta de éxito y escritura local. Un fallo después del commit MySQL se recupera mediante sync_operations, insertado en la misma transacción que el cambio de datos. La clave única impide repetir una escritura; reutilizar clave con cuerpo distinto produce 409. No se borran registros locales porque no aparezcan en una lista remota.

Reintento inicial 15 s, aumenta a 30/60 s ante fallos, vuelve a 15 s al completar; eventos online/focus también disparan sincronización. navigator.onLine solo informa red: health/fetch determinan disponibilidad real de Apache/MySQL. El cierre del navegador conserva la cola pero no la procesa hasta reabrir. La página puede esperar el timeout de red durante una mutación concurrente porque comparte el bloqueo.

## 7. Resolución de conflictos y migración

Control optimista mediante revision: un cliente no sobrescribe cambios remotos que no leyó. 409/404/422 y otros errores definitivos conservan el registro y cola con `_syncError`, visibles como conflictos. El resto de registros puede sincronizarse. El botón Resolver requiere confirmación: guarda las ediciones conflictivas como nuevas copias con IDs nuevos y recupera la versión remota. Si era eliminación en conflicto, la cancela y recupera el remoto. No hay fusión automática de texto ni prioridad por reloj del dispositivo. Para datos inválidos corrige los campos antes de volver a sincronizar; conserva un respaldo antes de intervenciones manuales.

Los registros locales existentes sin metadatos se importan mediante POST, nunca mediante upsert que pudiera sobrescribir un ID remoto. Si colisionan, se aplica resolución explícita. Los datos de IndexedDB y localStorage pueden diferir: no se fusionan silenciosamente.

Cambio de origen (por ejemplo localhost:3000 a localhost): en la consola de la aplicación anterior ejecuta `copy(JSON.stringify({tasks:await StorageEngine.getTasks(),notes:await StorageEngine.getNotes()}))` y guarda el JSON como respaldo. En la nueva aplicación importa desde un archivo con la herramienta que se proporciona abajo; conserva el origen anterior hasta confirmar conteos en MySQL. No borres datos del sitio ni desregistres almacenamiento antes del respaldo. Para contenido en el fallback, exporta también las claves pwa_life_tasks y pwa_life_notes desde DevTools.

## 8. Seguridad y PWA

Consultas preparadas PDO con emulación desactivada, tablas permitidas, límites de tipo/longitud, fechas reales, prioridades y colores permitidos. Texto escapado y eventos delegados evitan interpolar IDs dentro de código JavaScript. Los colores y clases dinámicas usan listas o patrones seguros. Mutaciones exigen JSON y X-PWA-Request: 1; se rechazan Origin externo y Sec-Fetch-Site cross-site, sin cabeceras CORS permisivas. No hay cookies de autenticación ni usuarios ficticios. Esta protección de solicitudes entre sitios no reemplaza autenticación/autorización.

.htaccess impide exposición de configuración, SQL, .git y scripts internos. El servidor Node solo permite recursos públicos. Cache Storage contiene únicamente URLs explícitas del shell, excluye API, query strings y mutaciones. El caché v2 está separado por ruta de aplicación; el SW conserva scope relativo y el manifest mantiene start_url/scope relativos. La instalación se verifica en navegador compatible, HTTPS o localhost. No publicar el servicio sin usuarios/permisos, TLS, respaldos y controles de abuso.

Referencias técnicas: [PDO prepare](https://www.php.net/manual/en/pdo.prepare.php), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## 9. Pruebas y resultados

Resultados locales iniciales: 14 pruebas unitarias de almacenamiento/protocolo aprobadas; sintaxis PHP 8.2 y JavaScript aprobada. La primera ejecución HTTP encontró Apache apagado; ese resultado no se considera prueba MySQL exitosa. La integración HTTP se ejecuta separadamente con `node scripts/verify-api.mjs` después de instalar XAMPP. Los dobles unitarios no sustituyen pruebas de IndexedDB real ni de MySQL.

| # | Verificación reproducible |
| --- | --- |
| 1 | GET api/health devuelve ok y phpMyAdmin muestra las tres tablas |
| 2–5 | Crear, consultar, editar, completar y eliminar tarea; comparar columnas SQL |
| 6–9 | Crear, consultar, editar y eliminar nota; comprobar tombstone SQL |
| 10 | Crear ambos tipos, recargar y comparar IDs y métricas |
| 11 | Reiniciar Apache/MySQL desde XAMPP y volver a consultar los mismos IDs |
| 12 | Cargar shell, DevTools Network Offline, recargar normalmente y realizar CRUD |
| 13 | Recuperar conexión; esperar pendientes 0 y comparar estado MySQL |
| 14 | Repetir misma clave/cuerpo con script API; solo un ID y una revisión inicial |
| 15 | Application → Service Workers: activo, scope /PWA-Life/; Cache Storage sin API |
| 16 | Instalar en Chrome/Edge y abrir standalone desde sistema operativo |
| 17 | Revisar Dashboard, modales, navegación, filtros y búsqueda a 375/768/1440 px |
| 18 | Detener MySQL manteniendo Internet; guardar localmente, reiniciar y sincronizar |

Pruebas adicionales: dos pestañas editando mismo registro, modificación desde otro perfil para provocar 409, cierre de pestaña con pendientes, respuesta perdida tras commit, Unicode, validación de fecha/color y denegación de rutas privadas. Los registros test-* de integración se conservan eliminados lógicamente para verificación. Las acciones gráficas, instalación y reinicio de servicios se documentan como pendientes mientras no exista evidencia de ejecución.

## 10. Limitaciones

Sin autenticación, paginación ni sincronización con aplicación cerrada. GET descarga todo el conjunto (adecuado para alcance académico). No purgar ledger/tombstones sin una política de retención y clientes. La cuota/limpieza del navegador puede perder datos no respaldados. No hay garantía de rescatar datos de un origen que ya fue borrado. Se necesita respaldo de MySQL para desastres; no se debe editar revision manualmente. Fallos de configuración requieren revisar logs locales.

## 11. Evidencia de ejecución en XAMPP

Resultado final de la sesión de implementación:

- Instalación real en `C:\xampp\htdocs\PWA-Life`; Apache y MySQL iniciados y `/api/health` correcto.
- **16/16 pruebas unitarias aprobadas**, incluyendo respaldo/importación y corrección de validaciones. Dobles controlados para fallos y respuestas perdidas.
- **38 comprobaciones HTTP aprobadas** con Apache, PHP y MySQL reales: CRUD de ambos recursos, PATCH de tareas, Unicode, idempotencia, revisiones, errores de validación, origen/cabeceras y rutas privadas.
- Sintaxis PHP comprobada con PHP 8.2.12 de XAMPP; sintaxis JavaScript y revisión de whitespace sin errores.
- Chrome headless con perfil aislado: formularios reales de tareas/notas, IndexedDB real, persistencia al recargar, edición/creación sin red, recarga offline por Service Worker y posterior confirmación MySQL aprobados.
- Manifest sin errores; Cache Storage sin rutas API/backend; sin excepciones JavaScript durante el flujo; sin desbordamiento horizontal a 375, 768 y 1440 px.
- Se abrió phpMyAdmin y se verificó que tanto el ID de la tarea como el de la nota creada offline aparecen realmente en las respectivas tablas.

Evidencias locales (excluidas de Git): `test-results/browser-results.json`, `pwa-375.png`, `pwa-768.png`, `pwa-1440.png`, `phpmyadmin-tasks.png`, `phpmyadmin-notes.png`. IDs de la ejecución: tarea `task-1794194588751-zy84`, nota offline `note-offline-1794194588713`. Permanecen como datos de prueba en MySQL; no se eliminaron registros del usuario.

Reproducir navegador: `node scripts/verify-browser.mjs` con Chrome instalado y XAMPP activo; genera un perfil aislado bajo test-results y capturas nuevas. Requiere puerto de depuración 9229 libre. La instalación nativa (diálogo de instalación/standalone) y la persistencia después de reiniciar Apache/MySQL **no se ejecutaron**. La caída exclusiva de MySQL con Internet disponible se comprobó en el protocolo con dobles, no deteniendo el servicio real. Las capturas y ausencia de overflow no sustituyen una revisión manual completa de todos los modales y controles responsivos.

Para migración, pulsa **Importar** en la barra inferior y selecciona el JSON exportado del origen anterior. Solo agrega IDs que no existan localmente; no reemplaza registros ni metadatos de sincronización. Omite tombstones del respaldo, conserva IDs activos y encola POST. Importarlo dos veces no duplica IDs locales. **Exportar** descarga ambos almacenes con sus metadatos como respaldo de inspección; la importación está diseñada para migrar registros activos, no para restaurar operaciones pendientes históricas. Conserva siempre el archivo original.
## Sistema de notificaciones y Web Push (implementado)

La versión actual conserva la arquitectura existente y agrega hora opcional de vencimiento, recordatorios locales, centro de notificaciones y Web Push. Una tarea que solo tiene `dueDate` sigue siendo una tarea de calendario: no se inventa una hora. Cuando se introduce hora, el navegador envía `dueAt` en UTC y `timeZone` IANA.

El botón de campana muestra recientes, próximas (24 h), vencidas, lectura, acceso a la tarea y posposición de 10 minutos. Las preferencias incluyen activación global, anticipación, vencidas, resumen diario, hora y silencio. El permiso solo se solicita después de **Activar notificaciones**.

`js/notification-core.js` mantiene eventos e IDs hash en IndexedDB. `sw.js` recibe `push`, valida que el evento corresponda a una tarea pendiente, muestra `showNotification()` una sola vez y maneja `notificationclick`. El backend almacena dispositivos, suscripciones, recordatorios programados y logs. El alcance actual se limita a la máquina local porque no existe autenticación; antes de publicar se requiere autenticación y autorización por usuario.

La librería `minishlink/web-push` 10.1.0 se instala con Composer y requiere PHP 8.2+, cURL y OpenSSL. `backend/config/push.local.php` contiene la clave privada VAPID y está excluido de Git. `/api/notifications/config` solo devuelve la pública. La migración `database/migrations/002_notifications.sql` es aditiva y se ejecuta mediante `scripts/migrate-notifications.php`, con bloqueo MySQL y comprobación de conteos.

Para instalar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-xampp.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File C:\xampp\htdocs\PWA-Life\scripts\setup-notifications.ps1
```

La tarea `PWA-Life-Reminders` ejecuta `run-reminders.ps1` cada minuto, con instancias concurrentes ignoradas. El worker CLI planifica y envía hasta 100 eventos, registra resultados, aplica backoff y desactiva suscripciones expiradas. Comprobar con `Get-ScheduledTask -TaskName PWA-Life-Reminders` y `Get-ScheduledTaskInfo -TaskName PWA-Life-Reminders`. HTTP 429 de `/api/notifications/test` es el enfriamiento deliberado de un minuto y no debe eliminarse.

En Chrome: abre `http://localhost/PWA-Life/`, campana, **Activar notificaciones**, acepta permiso, guarda preferencias y crea una tarea con hora futura. **Prueba local** verifica la aplicación abierta; **Prueba push** encola el envío para el programador. Para probar con la pestaña cerrada, deja Apache, MySQL, la tarea programada y conectividad activos; el Service Worker puede recibir el push sin página abierta, aunque Windows, Chrome y el proveedor pueden retrasarlo. El endpoint local requiere backend encendido para sincronizar y encolar. iOS/iPadOS necesita 16.4+ y añadir la PWA a pantalla de inicio; producción requiere HTTPS.

Resultados de esta sesión: XAMPP actualizado, `/api/health` correcto, migración aditiva conservó los registros existentes (los conteos actuales incluyen datos de prueba y tombstones), claves VAPID locales generadas, tarea programada en estado Ready y wrapper oculto con `logs/reminders.log` ignorado por Git. Pasaron 25 pruebas Node, modelo PHP, sintaxis PHP/JS/SW y 30 pruebas HTTP de notificaciones. Chrome headless comprobó Service Worker, IndexedDB, responsividad y una notificación local real con permiso concedido. En la instalación XAMPP se verificó una suscripción activa: el worker obtuvo cinco respuestas `push_service_accepted` HTTP 201 y cada evento registró `received_at`, evidencia de entrega al Service Worker. La aparición visual en Windows depende además de los permisos de Chrome y de la configuración de notificaciones del sistema; debe confirmarse manualmente en la sesión instalada.
