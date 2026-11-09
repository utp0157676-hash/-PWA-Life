# PWA Life – Enfoque Diario

Proyecto académico de Aplicaciones Web Progresivas, Universidad Tecnológica de Puebla. Conserva Dashboard, tareas, notas, filtros, modales, instalación y diseño responsivo. Ejecución principal: **Apache + PHP 8 + MySQL/MariaDB de XAMPP**. Node es opcional para pruebas y desarrollo estático.

## Arquitectura

Interfaz → StorageEngine → IndexedDB + cola persistente → Fetch → API PHP/PDO → MySQL.

El indicador inferior distingue pendientes, disponibilidad del servidor y confirmación en MySQL. Cache Storage guarda únicamente el shell. localStorage permanece como respaldo si IndexedDB no abre.

## Instalación en Windows

1. Instala XAMPP con PHP 8 o superior. Habilita `pdo_mysql` y `mbstring` en `C:\xampp\php\php.ini`.
2. Copia el proyecto a **C:\xampp\htdocs\PWA-Life**, excluyendo `.git` y credenciales ajenas.
3. Copia `backend/config/database.example.php` a `backend/config/database.local.php`. Configura host, puerto, usuario y contraseña de tu MySQL. El archivo local está excluido de Git. `origin` debe ser `http://localhost` (incluye puerto si Apache usa otro).
4. Inicia **Apache y MySQL** desde XAMPP Control Panel.
5. Abre **http://localhost/phpmyadmin/** → Importar → selecciona `database/pwa_life_db.sql` → Continuar. Crea `pwa_life_db`, `tasks`, `notes`, `sync_operations` sin borrar registros existentes.
6. Abre **http://localhost/PWA-Life/api/health**: debe responder `{"data":{"status":"ok"}}`.
7. Abre **http://localhost/PWA-Life/** en Chrome/Edge actualizado, con Web Locks disponible.

Alternativa automática, desde PowerShell en el repositorio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-xampp.ps1
```

Copia archivos, conserva la configuración local existente, inicia los servicios, importa el esquema y comprueba la conexión. Requiere permisos para escribir en XAMPP y puertos 80/3306 disponibles. Si MySQL tiene contraseña, configura primero el archivo local de la instalación. Apache requiere `mod_rewrite` y `AllowOverride All` en htdocs. No uses Live Server para ejecutar PHP.

## Verificar MySQL desde phpMyAdmin

Crea una tarea y una nota; espera **Cambios confirmados en MySQL / Pendientes: 0**. En http://localhost/phpmyadmin/ selecciona `pwa_life_db` → `tasks` o `notes` → **Examinar**. Compara los IDs, títulos y contenido. Edita y vuelve a consultar. Al eliminar, el registro permanece con `deleted_at` distinto de NULL.

```sql
SELECT id, title, completed, revision, deleted_at FROM pwa_life_db.tasks;
SELECT id, title, content, revision, deleted_at FROM pwa_life_db.notes;
SELECT id, status_code, created_at FROM pwa_life_db.sync_operations;
```

## Endpoints

Base: `http://localhost/PWA-Life/api/`. JSON camelCase; SQL snake_case.

| Ruta | Métodos |
| --- | --- |
| health | GET, comprueba PDO y tablas |
| tasks, notes | GET activos, POST crear |
| tasks/{id} | GET, PUT, PATCH, DELETE lógico |
| notes/{id} | GET, PUT, DELETE lógico |
| tasks?include_deleted=1, notes?include_deleted=1 | GET incluyendo eliminados |

Mutaciones: `Content-Type: application/json`, `X-PWA-Request: 1`, `Idempotency-Key` único. PUT/PATCH/DELETE requieren `revision` vigente en el cuerpo. Ejemplos en [DOCUMENTACION.md](DOCUMENTACION.md).

## Offline y migración

La cola `_outbox` se guarda en el mismo registro y transacción que el cambio local. Los IDs son estables; una respuesta perdida se reintenta con la misma clave y cuerpo. MySQL reconoce el reintento y no repite la escritura. Se comprueba `/health` y se reintenta cada 15–60 segundos mientras la página está abierta, al recuperar conexión y al recuperar foco.

Los registros anteriores se importan con POST. Si el ID ya existe o cambió la revisión, se conserva el cambio local: **Resolver** guarda las ediciones como copias nuevas y mantiene la versión remota. Las eliminaciones en conflicto se cancelan con confirmación del usuario. No hay sobrescritura automática por reloj.

`localhost:3000` y `localhost` son orígenes distintos. Exporta los datos antes de cambiar de origen siguiendo la documentación. No se fusionan automáticamente IndexedDB y localStorage; conserva ambos.

## Pruebas

```powershell
node --test test/*.test.js
node scripts/verify-api.mjs
```

El primer comando prueba almacenamiento y sincronización con dobles controlados. El segundo requiere XAMPP activo y prueba HTTP/MySQL; deja registros `test-*` eliminados lógicamente para inspección. Resultados y matriz de aceptación en [DOCUMENTACION.md](DOCUMENTACION.md).

## Seguridad y límites

Entorno local académico **sin autenticación**. Antes de publicarlo requiere usuarios, autorización, HTTPS, respaldos y límites de uso. Incluye PDO preparado, validación, errores controlados, restricción de origen/cabeceras para mutaciones, directorios protegidos y salida escapada. No se habilita CORS entre orígenes. `database.local.php` no debe versionarse.

La sincronización necesita la aplicación abierta; no se garantiza trabajo con el navegador cerrado. El almacenamiento del navegador no sustituye respaldos. `server.js` solo entrega recursos públicos y no ejecuta PHP.

## Resultado verificado

Instalado y conectado realmente a XAMPP/MySQL. Pasaron 16 pruebas unitarias y 38 comprobaciones HTTP. Chrome verificó IndexedDB, recarga offline, sincronización y registros visibles en phpMyAdmin. Evidencias en `test-results/` (no versionadas). Pendientes manuales: instalación nativa, reinicio de servicios y caída exclusiva de MySQL. Consulta el detalle y límites de estas pruebas en DOCUMENTACION.md, sección 11.
