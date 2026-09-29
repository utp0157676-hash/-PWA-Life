# PWA Life - Sistema de Organización Personal

> **Aplicación Web Progresiva (Progressive Web App)** completa, funcional, moderna y académicamente documentable, diseñada para demostrar las capacidades nativas de la web moderna, funcionamiento sin conexión (Offline-First), almacenamiento local persistente e instalabilidad multiplataforma.

---

## Índice

1. [Nombre del Proyecto](#1-nombre-del-proyecto)
2. [Descripción](#2-descripción)
3. [Objetivo](#3-objetivo)
4. [Tecnologías Utilizadas](#4-tecnologías-utilizadas)
5. [Características Principales](#5-características-principales)
6. [Instalación](#6-instalación)
7. [Ejecución Local (Paso a Paso en Windows CMD)](#7-ejecución-local-paso-a-paso-en-windows-cmd)
8. [Estructura del Proyecto](#8-estructura-del-proyecto)
9. [Funcionamiento del Service Worker](#9-funcionamiento-del-service-worker)
10. [Funcionamiento del Web App Manifest](#10-funcionamiento-del-web-app-manifest)
11. [Estrategia de Caché](#11-estrategia-de-caché)
12. [Funcionamiento Offline (Modo Sin Conexión)](#12-funcionamiento-offline-modo-sin-conexión)
13. [Almacenamiento Local (IndexedDB y localStorage)](#13-almacenamiento-local-indexeddb-y-localstorage)
14. [Pruebas Realizadas](#14-pruebas-realizadas)
15. [Posibles Mejoras Futuras](#15-posibles-mejoras-futuras)

---

## 1. Nombre del Proyecto

**PWA Life**  
*Asistente Progresivo de Organización Personal*

---

## 2. Descripción

**PWA Life** es una aplicación web progresiva orientada a la organización personal. Permite administrar tareas y notas desde una interfaz responsiva que puede instalarse en dispositivos compatibles y continuar ofreciendo determinadas funcionalidades cuando no existe conexión a Internet.

A diferencia de un sitio web convencional, **PWA Life** opera bajo una arquitectura *Offline-First* que aprovecha un Service Worker dedicado, la API de Cache Storage y el motor de bases de datos relacionales/NoSQL del navegador (IndexedDB), brindando una experiencia idéntica a una aplicación de escritorio o aplicación móvil nativa.

---

## 3. Objetivo

Proporcionar una solución de productividad personal ágil y confiable, sirviendo a la vez como un prototipo académico riguroso y demostrable para el estudio de las tecnologías PWA:
- Demostrar la independencia de la red mediante caché y persistencia local.
- Exhibir el proceso de instalación en el sistema operativo mediante el estándar Web App Manifest.
- Demostrar el ciclo de vida de un Service Worker (instalación, activación, intercepción de peticiones).
- Implementar interfaces adaptativas para smartphones, tablets y equipos de cómputo sin dependencias de frameworks externos.

---

## 4. Tecnologías Utilizadas

- **HTML5 Semántico**: Estructura accesible (`header`, `main`, `aside`, `nav`, `section`, `article`, `dialog`) y metadatos de aplicación móvil.
- **CSS3 Puro (Vanilla CSS)**:
  - Variables CSS (Custom Properties) para consistencia de tema.
  - Diseño adaptable mediante Flexbox y CSS Grid.
  - Reglas `@media` con puntos de interrupción para móvil (<= 480px), tablet (<= 768px, <= 992px) y escritorio (> 992px).
  - Efectos visuales modernos (Backdrop Filter, transiciones fluidas, elevaciones con sombras suaves).
- **JavaScript Moderno (ES6+ Vanilla)**:
  - Arquitectura modular basada en el patrón Módulo revelador (`StorageEngine`, `TaskManager`, `NotesManager`, `PWAManager`, `App`).
  - Asincronía pura con `async/await` y `Promises`.
  - Iconografía vectorial SVG inline (sin emojis principales, garantizando estética académica formal).
- **Web APIs del Navegador**:
  - Service Workers API (`navigator.serviceWorker`).
  - Cache Storage API (`caches.open`, `cache.addAll`, `cache.match`).
  - IndexedDB API (`indexedDB.open`) con fallback a `localStorage`.
  - Network Information / Online-Offline Events (`navigator.onLine`, eventos `online` y `offline`).
  - BeforeInstallPrompt Event (`window.addEventListener('beforeinstallprompt')`).
  - Storage Manager API (`navigator.storage.estimate`).
- **Entorno de Ejecución Local**:
  - Servidor HTTP nativo en Node.js (`server.js`, sin módulos de terceros).

---

## 5. Características Principales

### A) Panel Principal (Dashboard)
- Resumen métrico en tiempo real: total de tareas pendientes, completadas, notas almacenadas y tareas urgentes.
- Barra de progreso porcentual del nivel de cumplimiento diario.
- Vista previa de tareas próximas a vencer con botón de completado rápido.
- Indicador visual dinámico del estado de conectividad ("Conectado" en verde / "Sin conexión" en ámbar) con animación de pulso.

### B) Gestor de Tareas Completo
- **Creación y Edición**: Modal accesible con validación de título, descripción, selector de prioridad (Alta, Media, Baja) y fecha límite.
- **Cambio de Estado**: Marcar y desmarcar tareas como completadas con retroalimentación visual e interactiva.
- **Filtros Dinámicos**: Filtrar instantáneamente por estado (Todas, Pendientes, Completadas) y por nivel de prioridad.
- **Búsqueda en Tiempo Real**: Filtrado reactivo mientras el usuario escribe, buscando coincidencias en título y contenido.
- **Eliminación**: Confirmación de borrado y actualización inmediata de la interfaz y métricas.

### C) Bloc de Notas Personales
- Creación, modificación y supresión de notas.
- Clasificación por categorías temáticas: *Académico*, *Trabajo*, *Personal* e *Ideas*, cada una con etiquetas de color distintivas.
- Búsqueda en tiempo real en títulos y cuerpos de notas.
- Vista en rejilla moderna tipo "cards".

### D) Sección "Información PWA" (Diagnóstico Técnico)
- Panel de control técnico diseñado para demostraciones y capturas de pantalla:
  - Estado del Service Worker (Activo / Instalando / Espera / Ámbito).
  - Estado del Web App Manifest y configuración detectada.
  - Estado de conectividad de red y respuesta de fallbacks.
  - Elegibilidad de instalación y modo de visualización actual (`standalone` vs navegador).
  - Diagnóstico de almacenamiento: Motor activo (IndexedDB), número de registros y cuota consumida/disponible (`navigator.storage.estimate`).
  - Monitor de Cache Storage: Identificador de caché y conteo de recursos prealmacenados.
  - Botón interactivo para forzar comprobación de actualizaciones de caché.
  - Matriz comparativa académica de características PWA y cómo inspeccionarlas en DevTools.

---

## 6. Instalación

El proyecto no requiere gestores de dependencias externos pesados ni configuración de bases de datos.

1. Clonar o descargar el repositorio en tu computadora:
   ```bash
   git clone <url-del-repositorio> PWA-Proyecto
   cd PWA-Proyecto
   ```
2. Verificar que posees Node.js instalado (versión 16 o superior):
   ```bash
   node -v
   ```

---

## 7. Ejecución Local (Paso a Paso en Windows CMD)

Las PWAs requieren ejecutarse bajo un servidor local (`http://localhost`) o mediante un certificado seguro (`https://`) para que el navegador autorice el registro del Service Worker y Cache Storage.

### Pasos exactos desde la consola de Windows (CMD):

1. **Abrir el Símbolo del Sistema (CMD)**:
   Presiona `Windows + R`, escribe `cmd` y presiona `Enter`.

2. **Navegar a la carpeta del proyecto**:
   ```cmd
   cd C:\Users\Lenovo\PWA-Proyecto
   ```

3. **Iniciar el servidor local**:
   Ejecuta cualquiera de los dos comandos siguientes:
   ```cmd
   node server.js
   ```
   *O alternativamente:*
   ```cmd
   npm start
   ```

4. **Verificar mensaje de confirmación**:
   La consola mostrará:
   ```text
   ====================================================
          PWA LIFE - SERVIDOR LOCAL ACTIVO             
   ====================================================
    Servidor ejecutándose en: http://localhost:3000
    Para detener el servidor presiona: CTRL + C         
   ====================================================
   ```

5. **Abrir la aplicación en Google Chrome o Microsoft Edge**:
   Abre tu navegador e ingresa a:
   ```text
   http://localhost:3000
   ```

---

## 8. Estructura del Proyecto

```text
PWA-Proyecto/
│
├── index.html          # Documento principal HTML5 semántico y accesible
├── manifest.json       # Web App Manifest con metadatos de instalación e iconos
├── sw.js               # Service Worker: ciclo de vida, pre-caching y red
├── server.js           # Servidor local Node.js nativo (Zero Dependencies)
├── package.json        # Metadatos del proyecto y script de inicio (npm start)
│
├── css/
│   └── styles.css      # Hoja de estilos moderna, responsive (@media) y variables CSS
│
├── js/
│   ├── app.js          # Coordinador SPA, métricas del Dashboard, modales y Toast
│   ├── tasks.js        # Módulo de lógica de tareas (CRUD, filtros, búsqueda)
│   ├── notes.js        # Módulo de bloc de notas (CRUD, categorías, búsqueda)
│   ├── storage.js      # Capa de persistencia local (IndexedDB con fallback localStorage)
│   └── pwa.js          # Integración PWA, registro SW, install prompt y telemetría
│
├── icons/
│   ├── icon-192.png           # Icono estándar para pantalla de inicio (192x192)
│   ├── icon-512.png           # Icono de alta resolución para splash screen (512x512)
│   ├── icon-maskable-192.png  # Icono adaptable a formas Android (192x192)
│   ├── icon-maskable-512.png  # Icono adaptable a formas Android (512x512)
│   └── icon.svg               # Vector maestro SVG de alta definición
│
├── README.md           # Guía completa de uso, arquitectura e instrucciones
└── DOCUMENTACION.md    # Reporte formal académico de 20 secciones con evidencias
```

---

## 9. Funcionamiento del Service Worker

El archivo `sw.js` actúa como un proxy interceptor situado entre el cliente web y la red. Su ciclo de vida opera de la siguiente manera:

1. **Registro (`navigator.serviceWorker.register`)**:
   Iniciado desde `js/pwa.js` en el hilo de ejecución principal una vez cargado el DOM.
2. **Instalación (`install`)**:
   El Service Worker descarga los recursos esenciales del *App Shell* (`index.html`, `styles.css`, scripts JS e iconos) y los guarda en el Cache Storage mediante `cache.addAll()`. Invoca `self.skipWaiting()` para activarse de inmediato.
3. **Activación (`activate`)**:
   Identifica versiones previas de la caché mediante `caches.keys()`. Si detecta una versión obsoleta, la purga automáticamente para liberar almacenamiento. Invoca `self.clients.claim()` para tomar control inmediato de las pestañas abiertas.
4. **Intercepción de Peticiones (`fetch`)**:
   Intercepta todas las solicitudes HTTP GET salientes generadas por la aplicación. Aplica estrategias diferenciadas según la naturaleza de la petición.

---

## 10. Funcionamiento del Web App Manifest

El archivo `manifest.json` informa al sistema operativo y al navegador sobre cómo debe comportarse la aplicación al ser instalada:

- `name`: "PWA Life - Organización Personal" (Nombre completo en instalador y splash screen).
- `short_name`: "PWA Life" (Nombre bajo el icono en el escritorio o menú de aplicaciones).
- `start_url`: "./index.html" (Punto de entrada al lanzar la app instalada).
- `scope`: "./" (Define el alcance de URLs bajo el control de la PWA).
- `display`: "standalone" (Oculta la barra de direcciones y botones del navegador, luciendo como app nativa).
- `theme_color`: "#1e293b" (Afecta el color de la barra de título del sistema operativo).
- `background_color`: "#0f172a" (Color de fondo de la pantalla de bienvenida o Splash Screen).
- `icons`: Conjunto de resoluciones (192x192 y 512x512) con propósitos `any` y `maskable` para adaptarse a iconos circulares, cuadrados o con esquinas redondeadas.
- `shortcuts`: Accesos directos rápidos al hacer clic derecho sobre el icono instalado ("Tareas", "Notas", "PWA Info").

---

## 11. Estrategia de Caché

La aplicación implementa una estrategia híbrida y resiliente:

1. **Navegación (`request.mode === 'navigate'`)**:
   - **Estrategia**: *Network First con fallback a Cache Storage*.
   - **Mecanismo**: Intenta descargar la versión más reciente de la página desde la red. Si la conexión falla (offline) o hay latencia severa, rescata inmediatamente el archivo `index.html` previamente almacenado en caché.
2. **Recursos Estáticos del App Shell (CSS, JS, Iconos, SVGs)**:
   - **Estrategia**: *Cache First con sincronización en red*.
   - **Mecanismo**: Sirve el recurso instantáneamente desde el Cache Storage para una carga de milisegundos. En caso de no existir aún en caché, lo descarga de la red y lo indexa para futuras peticiones.

---

## 12. Funcionamiento Offline (Modo Sin Conexión)

Cuando el dispositivo se queda sin conexión a internet o el usuario activa el modo avión:

1. El evento global `window.addEventListener('offline')` se dispara de inmediato.
2. `js/pwa.js` actualiza los indicadores visuales:
   - Muestra el banner superior naranja: *"Modo sin conexión: Estás navegando con recursos de Cache Storage y persistencia local"*.
   - Cambia la insignia del encabezado a "Sin conexión" con punto ámbar.
   - Despliega una notificación Toast informativa.
3. El Service Worker responde a todas las peticiones utilizando los recursos precacheados en Cache Storage.
4. El usuario puede continuar:
   - Creando nuevas tareas y notas.
   - Editando elementos existentes.
   - Filtrando y buscando información.
   - Navegando entre todas las vistas de la aplicación.
5. Todos los datos persisten intactos en **IndexedDB**, garantizando cero pérdida de información.

---

## 13. Almacenamiento Local (IndexedDB y localStorage)

La capa `js/storage.js` gestiona el almacenamiento con una arquitectura asíncrona:

- **IndexedDB (`pwa_life_database`, Versión 1)**:
  - Base de datos transaccional en el navegador que almacena objetos JavaScript estructurados sin serializaciones innecesarias.
  - Contiene dos almacenes de objetos (*Object Stores*): `tasks` y `notes`.
  - Dispone de índices para búsquedas optimizadas por prioridad, estado de completado, categoría y fechas.
- **Fallback a `localStorage`**:
  - En caso de que el navegador tenga deshabilitado IndexedDB (por ejemplo en ciertas ventanas de incógnito restrictivas), la aplicación conmuta de forma transparente a `localStorage`.
- **Datos Iniciales (Seed Data)**:
  - La primera vez que se ejecuta la app, se precargan ejemplos académicos de tareas y notas para facilitar la evaluación sin necesidad de capturar datos manualmente.

---

## 14. Pruebas Realizadas

1. **Validación de Manifest**: Aprobado por la herramienta Application > Manifest de Chrome/Edge DevTools sin advertencias.
2. **Registro de Service Worker**: Instalado y activado correctamente en ámbito `http://localhost:3000/`.
3. **Pre-caching en Cache Storage**: Verificado almacenamiento íntegro de 14 recursos en `pwa-life-cache-v1.0.0`.
4. **Simulación Offline**: Conexión cortada vía DevTools (Network > Offline). La app recarga fluidamente y mantiene la navegación SPA.
5. **Persistencia de Datos**: Tareas y notas creadas en modo offline continúan presentes tras cerrar y reabrir la ventana o recargar el navegador.
6. **Instalación Standalone**: Evento `beforeinstallprompt` capturado con éxito; instalación en Windows como aplicación de escritorio nativa ejecutándose en ventana propia sin barra de URL.

---

## 15. Posibles Mejoras Futuras

1. **Background Sync API**: Sincronización en segundo plano de tareas creadas offline con un servidor REST central cuando la red vuelva a estar disponible.
2. **Web Push Notifications**: Notificaciones emergentes locales basadas en la API de Notificaciones para alertar sobre tareas próximas a vencer.
3. **Modo Oscuro / Claro Automático**: Detección de la preferencia del sistema (`prefers-color-scheme`) con interruptor manual de tema.
4. **Exportación e Importación**: Descarga y restauración de copias de seguridad de tareas y notas en formato JSON estándar.
