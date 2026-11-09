/**
 * ==============================================================================
 * MÓDULO PWA (PROGRESSIVE WEB APP) - PWA LIFE
 * ==============================================================================
 * 
 * Gestiona los componentes centrales del estándar PWA:
 * 1. Registro y ciclo de vida del Service Worker (sw.js).
 * 2. Detección en tiempo real del estado de red (online / offline).
 * 3. Captura del evento 'beforeinstallprompt' para instalación nativa.
 * 4. Métricas técnicas para la sección académica "Información PWA".
 * 5. Monitoreo de Cache Storage y APIs de almacenamiento del navegador.
 * ==============================================================================
 */

const PWAManager = (() => {
  let swRegistration = null;
  let deferredInstallPrompt = null;
  let isAppInstalled = false;

  /**
   * Inicializa la lógica PWA: registra el Service Worker y enlaza eventos de red e instalación.
   */
  async function init() {
    _checkDisplayMode();
    _bindNetworkEvents();
    _bindInstallPrompt();
    await _registerServiceWorker();
    await updateDiagnosticsPanel();
  }

  /**
   * 1. REGISTRO DEL SERVICE WORKER
   */
  async function _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker no está soportado en este navegador.');
      return;
    }

    try {
      console.log('[PWA] Registrando Service Worker: ./sw.js...');
      swRegistration = await navigator.serviceWorker.register('./sw.js', {
        scope: './'
      });

      console.log('[PWA] Service Worker registrado exitosamente. Ámbito (Scope):', swRegistration.scope);

      // Detectar estado de instalación/activación
      if (swRegistration.installing) {
        console.log('[PWA] Service Worker en estado: Instalando (installing)');
      } else if (swRegistration.waiting) {
        console.log('[PWA] Service Worker en estado: En espera (waiting)');
      } else if (swRegistration.active) {
        console.log('[PWA] Service Worker en estado: Activo y en control (active)');
      }

      // Escuchar futuras actualizaciones del SW
      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        console.log('[PWA] Nueva versión del Service Worker detectada...');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] Nuevo contenido disponible listo para actualizar.');
            App.showToast('Nueva versión de PWA Life disponible. Recarga para actualizar.', 'info');
          }
        });
      });

    } catch (error) {
      console.error('[PWA] Error crítico al registrar Service Worker:', error);
    }
  }

  /**
   * 2. DETECCIÓN DE RED (ONLINE / OFFLINE)
   */
  function _bindNetworkEvents() {
    window.addEventListener('sync-status', ({ detail }) => {
      _updateNetworkUI(detail.available);
      document.querySelectorAll('.network-status-text').forEach(el => {
        el.textContent = detail.available ? 'Servidor conectado' : 'Modo local';
      });
    });
    // Sincronizar estado inicial
    _updateNetworkUI(navigator.onLine);

    window.addEventListener('online', () => {
      console.log('[PWA Red] Conexión a Internet restablecida (online)');
      _updateNetworkUI(true);
      App.showToast('Conexión restablecida. Modo en línea activado.', 'success');
      updateDiagnosticsPanel();
    });

    window.addEventListener('offline', () => {
      console.warn('[PWA Red] Conexión perdida. Operando en modo offline.');
      _updateNetworkUI(false);
      App.showToast('Sin conexión a Internet. Operando en modo Offline.', 'warning');
      updateDiagnosticsPanel();
    });
  }

  function _updateNetworkUI(isOnline) {
    const banner = document.getElementById('offline-banner');
    const statusBadges = document.querySelectorAll('.network-status-badge');
    const statusTexts = document.querySelectorAll('.network-status-text');

    if (banner) {
      if (isOnline) {
        banner.classList.remove('visible');
      } else {
        banner.classList.add('visible');
      }
    }

    statusBadges.forEach((badge) => {
      badge.classList.remove('status-online', 'status-offline');
      badge.classList.add(isOnline ? 'status-online' : 'status-offline');
    });

    statusTexts.forEach((text) => {
      text.textContent = isOnline ? 'Conectado' : 'Sin conexión';
    });
  }

  /**
   * 3. INSTALABILIDAD Y 'beforeinstallprompt'
   */
  function _bindInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevenir el banner automático por defecto del navegador
      e.preventDefault();
      deferredInstallPrompt = e;
      console.log('[PWA Instalación] Evento beforeinstallprompt capturado. La app es elegible para instalación.');

      _showInstallUI(true);
      updateDiagnosticsPanel();
    });

    // Evento disparado cuando la PWA ha sido instalada con éxito
    window.addEventListener('appinstalled', (e) => {
      console.log('[PWA Instalación] ¡PWA Life ha sido instalada en el sistema!', e);
      deferredInstallPrompt = null;
      isAppInstalled = true;
      _showInstallUI(false);
      App.showToast('¡PWA Life se instaló exitosamente!', 'success');
      updateDiagnosticsPanel();
    });

    // Vincular botones de instalación en la interfaz
    const installBtns = document.querySelectorAll('.btn-trigger-install');
    installBtns.forEach((btn) => {
      btn.addEventListener('click', triggerInstallPrompt);
    });
  }

  /**
   * Dispara el diálogo de instalación nativo del navegador.
   */
  async function triggerInstallPrompt() {
    if (!deferredInstallPrompt) {
      if (isAppInstalled || _isStandalone()) {
        App.showToast('PWA Life ya está instalada en tu dispositivo.', 'info');
      } else {
        App.showToast('Tu navegador actual no soporta o ya tiene instalada la aplicación.', 'info');
      }
      return;
    }

    // Mostrar el prompt del navegador
    deferredInstallPrompt.prompt();

    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log(`[PWA Instalación] Respuesta del usuario: ${outcome}`);

    if (outcome === 'accepted') {
      App.showToast('Instalando PWA Life...', 'success');
    } else {
      App.showToast('Instalación cancelada por el usuario.', 'info');
    }

    deferredInstallPrompt = null;
    _showInstallUI(false);
    updateDiagnosticsPanel();
  }

  function _showInstallUI(show) {
    const installContainers = document.querySelectorAll('.install-prompt-container');
    installContainers.forEach((el) => {
      if (show) {
        el.classList.add('visible');
      } else {
        el.classList.remove('visible');
      }
    });
  }

  function _isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
  }

  function _checkDisplayMode() {
    if (_isStandalone()) {
      isAppInstalled = true;
      console.log('[PWA] Ejecutándose en modo independiente (Standalone Window).');
    } else {
      console.log('[PWA] Ejecutándose en pestaña del navegador (Browser Tab).');
    }
  }

  /**
   * 4. MÉTRICAS Y PANEL TÉCNICO ("Información PWA")
   */
  async function updateDiagnosticsPanel() {
    const swStatusEl = document.getElementById('diag-sw-status');
    const swScopeEl = document.getElementById('diag-sw-scope');
    const manifestStatusEl = document.getElementById('diag-manifest-status');
    const networkStatusEl = document.getElementById('diag-network-status');
    const installStatusEl = document.getElementById('diag-install-status');
    const displayModeEl = document.getElementById('diag-display-mode');
    const storageEngineEl = document.getElementById('diag-storage-engine');
    const storageUsageEl = document.getElementById('diag-storage-usage');
    const cacheCountEl = document.getElementById('diag-cache-count');
    const cacheNameEl = document.getElementById('diag-cache-name');

    // Estado del Service Worker
    if (swStatusEl) {
      if ('serviceWorker' in navigator && swRegistration) {
        const state = swRegistration.active ? 'Activo y en ejecución' :
                      swRegistration.waiting ? 'En espera' :
                      swRegistration.installing ? 'Instalándose' : 'Registrado';
        swStatusEl.textContent = state;
        swStatusEl.className = 'diag-value status-badge badge-active';
      } else if (!('serviceWorker' in navigator)) {
        swStatusEl.textContent = 'No Soportado';
        swStatusEl.className = 'diag-value status-badge badge-error';
      } else {
        swStatusEl.textContent = 'Pendiente de Registro';
        swStatusEl.className = 'diag-value status-badge badge-warning';
      }
    }

    if (swScopeEl && swRegistration) {
      swScopeEl.textContent = swRegistration.scope;
    }

    // Estado del Web App Manifest
    if (manifestStatusEl) {
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        manifestStatusEl.textContent = 'Configurado (manifest.json)';
        manifestStatusEl.className = 'diag-value status-badge badge-active';
      } else {
        manifestStatusEl.textContent = 'No Detectado';
        manifestStatusEl.className = 'diag-value status-badge badge-error';
      }
    }

    // Estado de Red
    if (networkStatusEl) {
      const isOnline = navigator.onLine;
      networkStatusEl.textContent = isOnline ? 'Online (Conectado)' : 'Offline (Sin Conexión)';
      networkStatusEl.className = `diag-value status-badge ${isOnline ? 'badge-active' : 'badge-warning'}`;
    }

    // Instalabilidad
    if (installStatusEl) {
      if (isAppInstalled || _isStandalone()) {
        installStatusEl.textContent = 'Instalada (Modo App)';
        installStatusEl.className = 'diag-value status-badge badge-active';
      } else if (deferredInstallPrompt) {
        installStatusEl.textContent = 'Disponible para Instalar';
        installStatusEl.className = 'diag-value status-badge badge-active';
      } else {
        installStatusEl.textContent = 'No elegible o no disponible en este navegador';
        installStatusEl.className = 'diag-value status-badge badge-neutral';
      }
    }

    // Modo de visualización
    if (displayModeEl) {
      displayModeEl.textContent = _isStandalone() ? 'Standalone (Ventana de aplicación nativa)' : 'Navegador estándar (Browser Tab)';
    }

    // Estado de Almacenamiento local (IndexedDB / localStorage)
    const storageStats = await StorageEngine.getDiagnostics();
    if (storageEngineEl) {
      storageEngineEl.textContent = `${storageStats.engine} (${storageStats.taskCount} tareas, ${storageStats.noteCount} notas)`;
    }

    if (storageUsageEl) {
      if (storageStats.quotaInfo.supported) {
        storageUsageEl.textContent = `${storageStats.quotaInfo.usageMB} MB usados de ${storageStats.quotaInfo.quotaMB} MB disponibles (${storageStats.quotaInfo.percentUsed})`;
      } else {
        storageUsageEl.textContent = 'Almacenamiento Local disponible';
      }
    }

    // Cache Storage Inspector
    if ('caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        if (cacheKeys.length > 0) {
          const primaryCache = cacheKeys[0];
          if (cacheNameEl) cacheNameEl.textContent = primaryCache;

          const cache = await caches.open(primaryCache);
          const cachedRequests = await cache.keys();
          if (cacheCountEl) cacheCountEl.textContent = `${cachedRequests.length} archivos en caché`;
        } else {
          if (cacheNameEl) cacheNameEl.textContent = 'Ninguna activa aún';
          if (cacheCountEl) cacheCountEl.textContent = '0 archivos';
        }
      } catch (e) {
        console.warn('Error al leer Cache Storage:', e);
      }
    }
  }

  /**
   * Forzar actualización de Service Worker para propósitos de demostración.
   */
  async function forceUpdate() {
    if (swRegistration) {
      App.showToast('Comprobando actualizaciones del Service Worker...', 'info');
      try {
        await swRegistration.update();
        App.showToast('Service Worker actualizado.', 'success');
        updateDiagnosticsPanel();
      } catch (e) {
        App.showToast('No se pudo verificar la actualización.', 'error');
      }
    }
  }

  return {
    init,
    triggerInstallPrompt,
    updateDiagnosticsPanel,
    forceUpdate,
    isStandalone: _isStandalone
  };
})();
