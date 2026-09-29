/**
 * ==============================================================================
 * SERVICE WORKER - PWA LIFE
 * ==============================================================================
 * 
 * PROYECTO ACADÉMICO: PWA Life - Sistema de Organización Personal
 * 
 * ¿QUÉ ES UN SERVICE WORKER?
 * Un Service Worker es un script que el navegador ejecuta en segundo plano,
 * separado de la página web (interfaz de usuario). Funciona como un proxy de red
 * programable que intercepta solicitudes HTTP salientes y decide cómo responder
 * (desde la red o desde el Cache Storage del navegador).
 * 
 * CICLO DE VIDA DEL SERVICE WORKER:
 * 1. Registro (Registration): Se inicia desde el hilo principal con navigator.serviceWorker.register().
 * 2. Instalación (Install): El SW se descarga y precachea los recursos del "App Shell".
 * 3. Activación (Activate): Se eliminan versiones antiguas de cachés y toma control de los clientes.
 * 4. Intercepción (Fetch): Intercepta peticiones de red y aplica la estrategia de caché definida.
 * 
 * ESTRATEGIA DE CACHÉ IMPLEMENTADA:
 * - App Shell / Recursos Estáticos: Stale-While-Revalidate / Cache First con actualización.
 * - Peticiones de Navegación (HTML): Network First con fallback automático a Cache Storage.
 *   Esto garantiza que el usuario siempre obtenga la última versión si tiene internet,
 *   y cargue instantáneamente desde la memoria local si está fuera de línea (Offline).
 * ==============================================================================
 */

// Nombre y versión de la caché. Al cambiar esta versión, se invalida la caché previa.
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `pwa-life-cache-${CACHE_VERSION}`;

// Lista de recursos esenciales que componen el "App Shell" de la aplicación.
// Estos recursos son descargados y almacenados durante la fase de instalación.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/tasks.js',
  './js/notes.js',
  './js/storage.js',
  './js/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg'
];

/**
 * ------------------------------------------------------------------------------
 * FASE 1: INSTALACIÓN ('install')
 * ------------------------------------------------------------------------------
 * Ocurre cuando el navegador detecta un Service Worker nuevo o actualizado.
 * Aquí abrimos Cache Storage y almacenamos todos los recursos estáticos del App Shell.
 */
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Evento: install (Versión: ${CACHE_VERSION})`);

  // event.waitUntil() asegura que el Service Worker no termine de instalarse
  // hasta que la promesa dentro de él se resuelva satisfactoriamente.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Almacenando recursos en caché (Pre-caching App Shell)...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[Service Worker] Todos los recursos fueron cacheados exitosamente.');
        // Fuerza al Service Worker a activarse de inmediato sin esperar a que se cierren las pestañas activas
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Falló el pre-caching durante la instalación:', error);
      })
  );
});

/**
 * ------------------------------------------------------------------------------
 * FASE 2: ACTIVACIÓN ('activate')
 * ------------------------------------------------------------------------------
 * Ocurre cuando el nuevo Service Worker toma el control.
 * Es el momento idóneo para realizar tareas de mantenimiento, como purgar cachés
 * antiguas de versiones previas para no desperdiciar espacio de almacenamiento.
 */
self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Evento: activate (Versión: ${CACHE_VERSION})`);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            // Si el nombre de la caché no coincide con la versión actual, se elimina
            if (cache !== CACHE_NAME) {
              console.log(`[Service Worker] Purgando caché obsoleta: ${cache}`);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Tomando control de todos los clientes abiertos (clients.claim)');
        // Permite que el Service Worker controle la página actual inmediatamente
        return self.clients.claim();
      })
  );
});

/**
 * ------------------------------------------------------------------------------
 * FASE 3: INTERCEPCIÓN DE PETICIONES ('fetch')
 * ------------------------------------------------------------------------------
 * Cada vez que la aplicación realiza una petición HTTP (imágenes, scripts, estilos, HTML),
 * el Service Worker la intercepta a través del evento 'fetch'.
 * 
 * ESTRATEGIAS SEGÚN EL TIPO DE PETICIÓN:
 * 1. Para navegación (HTML):
 *    - Estrategia: Network First con fallback a Cache.
 *    - Intenta obtener la versión más fresca de la red; si no hay internet (offline),
 *      responde inmediatamente con el archivo index.html almacenado en Cache Storage.
 * 
 * 2. Para recursos estáticos (CSS, JS, iconos):
 *    - Estrategia: Stale-While-Revalidate / Cache First.
 *    - Responde desde la caché para velocidad instantánea y busca en segundo plano
 *      actualizaciones en la red.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Solo interceptamos peticiones HTTP/HTTPS con método GET
  if (request.method !== 'GET') {
    return;
  }

  // Descartamos extensiones de navegador u orígenes externos no compatibles
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. Manejo especial de navegación (cargar la página HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Si la red responde, actualizamos la copia en caché de index.html
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si falló la red (offline), devolvemos index.html desde la caché
          console.log('[Service Worker] Offline detectado: Sirviendo index.html desde Cache Storage');
          return caches.match('./index.html').then((cachedIndex) => {
            return cachedIndex || caches.match('/');
          });
        })
    );
    return;
  }

  // 2. Manejo de recursos estáticos: Cache First con fallback a Network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Recurso encontrado en Cache Storage
          return cachedResponse;
        }

        // Si no está en caché, lo solicitamos a la red
        return fetch(request)
          .then((networkResponse) => {
            // Validar que la respuesta sea válida antes de cachear
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clonamos la respuesta porque el stream solo puede leerse una vez
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });

            return networkResponse;
          })
          .catch((error) => {
            console.warn(`[Service Worker] No se pudo obtener el recurso (${request.url}):`, error);
            // Fallback genérico si el recurso solicitado no está en caché ni red
            return new Response('Recurso no disponible en modo sin conexión.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
            });
          });
      })
  );
});

/**
 * ------------------------------------------------------------------------------
 * MENSAJES Y COMUNICACIÓN ('message')
 * ------------------------------------------------------------------------------
 * Permite que la interfaz de usuario se comunique con el Service Worker,
 * por ejemplo para forzar la actualización de caché o pedir el estado actual.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    console.log('[Service Worker] Recibida orden SKIP_WAITING desde la interfaz.');
    self.skipWaiting();
  } else if (event.data && event.data.action === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        version: CACHE_VERSION,
        cacheName: CACHE_NAME
      });
    }
  }
});
