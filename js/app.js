/**
 * ==============================================================================
 * APLICACIÓN PRINCIPAL (APP COORDINATOR) - PWA LIFE
 * ==============================================================================
 * 
 * Orquesta la navegación SPA (Single Page Application), estadísticas del Dashboard,
 * sistema de notificaciones Toast, control de modales y adaptabilidad móvil.
 * ==============================================================================
 */

const App = (() => {
  let currentView = 'dashboard';

  /**
   * Punto de entrada de la aplicación al cargar el DOM.
   */
  async function init() {
    console.log('[App] Inicializando PWA Life...');

    // 1. Inicializar almacenamiento local
    await StorageEngine.init();

    // 2. Inicializar módulos de negocio
    await TaskManager.init();
    await NotesManager.init();

    // 3. Inicializar módulo PWA (Service Worker, red, instalación)
    await PWAManager.init();

    // 4. Enlazar navegación y componentes de UI
    _bindNavigation();
    _bindGlobalModals();
    _bindMobileSidebar();
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action][data-record-id]');
      if (!target) return;
      const actions = {
        'task-toggle': TaskManager.toggleTaskStatus, 'task-edit': TaskManager.editTask,
        'task-delete': TaskManager.deleteTask, 'note-edit': NotesManager.editNote, 'note-delete': NotesManager.deleteNote
      };
      actions[target.dataset.action]?.(target.dataset.recordId);
    });

    // 5. Detectar ruta por hash inicial (p. ej., desde acceso directo del Manifest)
    _handleHashChange();
    window.addEventListener('hashchange', _handleHashChange);

    // 6. Actualizar métricas del Dashboard
    updateDashboardStats();

    const syncPanel = document.createElement('div');
    syncPanel.className = 'sync-panel';
    syncPanel.innerHTML = '<span role="status" id="sync-message">Comprobando MySQL…</span> <button type="button" class="btn-sm btn-outline" id="sync-retry">Sincronizar</button> <button type="button" class="btn-sm btn-outline" id="sync-resolve" hidden>Resolver</button>';
    document.body.appendChild(syncPanel);
    const exportButton = document.createElement('button');
    exportButton.className = 'btn-sm btn-outline';
    exportButton.textContent = 'Exportar';
    exportButton.addEventListener('click', async () => {
      try {
        const backup = { tasks: await StorageEngine.rawAll('tasks'), notes: await StorageEngine.rawAll('notes') };
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'pwa-life-respaldo.json'; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { showToast(error.message, 'error'); }
    });
    const importButton = document.createElement('button');
    importButton.className = 'btn-sm btn-outline';
    importButton.textContent = 'Importar';
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true;
    importButton.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      try {
        if (!input.files[0]) return;
        const count = await SyncEngine.importBackup(JSON.parse(await input.files[0].text()));
        showToast(`${count} registros importados localmente; se confirmarán en MySQL. IDs locales existentes conservados.`, 'info');
      } catch (error) { showToast(error.message, 'error'); }
      input.value = '';
    });
    syncPanel.append(exportButton, importButton, input);
    document.getElementById('sync-retry').addEventListener('click', () => SyncEngine.sync());
    document.getElementById('sync-resolve').addEventListener('click', async () => {
      if (!confirm('Se guardarán tus ediciones en conflicto como copias nuevas. Las eliminaciones en conflicto se cancelarán y se conservará la versión del servidor. ¿Continuar?')) return;
      try { await SyncEngine.resolveCopies(); }
      catch (error) { showToast(error.message, 'error'); }
    });
    window.addEventListener('sync-status', ({ detail }) => {
      document.getElementById('sync-message').textContent = `${detail.message} Pendientes: ${detail.pending}.`;
      document.getElementById('sync-resolve').hidden = !detail.conflicts;
    });
    window.addEventListener('data-synced', async () => {
      try {
        await Promise.all([TaskManager.loadTasks(), NotesManager.loadNotes()]);
        TaskManager.renderTasks();
        NotesManager.renderNotes();
        updateDashboardStats();
      } catch (error) { showToast(error.message, 'error'); }
    });
    SyncEngine.start();
    await NotificationUI.init();

    console.log('[App] PWA Life inicializada y lista.');
  }

  /**
   * Enlaza los botones de navegación de la barra lateral y menú móvil.
   */
  function _bindNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.dataset.view;
        if (targetView) {
          window.location.hash = targetView;
          navigateTo(targetView);
        }
      });
    });

    // Enlaces de acceso rápido en el Dashboard
    const quickLinks = document.querySelectorAll('[data-navigate]');
    quickLinks.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const view = btn.dataset.navigate;
        window.location.hash = view;
        navigateTo(view);
      });
    });
  }

  /**
   * Cambia de vista visible y actualiza el estado activo de los menús.
   */
  function navigateTo(viewName) {
    const views = document.querySelectorAll('.app-view');
    const navLinks = document.querySelectorAll('.nav-link');
    let targetViewEl = document.getElementById(`view-${viewName}`);

    if (!targetViewEl) {
      viewName = 'dashboard';
      targetViewEl = document.getElementById('view-dashboard');
    }

    currentView = viewName;

    // Ocultar todas las vistas y mostrar solo la seleccionada
    views.forEach((v) => v.classList.remove('active'));
    targetViewEl.classList.add('active');

    // Actualizar enlaces activos
    navLinks.forEach((l) => {
      if (l.dataset.view === viewName) {
        l.classList.add('active');
      } else {
        l.classList.remove('active');
      }
    });

    // Cerrar barra lateral en móvil al navegar
    _closeMobileSidebar();

    // Acciones específicas según la vista
    if (viewName === 'dashboard') {
      updateDashboardStats();
    } else if (viewName === 'pwa-info') {
      PWAManager.updateDiagnosticsPanel();
    }

    // Scroll arriba suave
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _handleHashChange() {
    const rawHash = window.location.hash.replace('#', '').trim().split('?')[0];
    if (['dashboard', 'tasks', 'notes', 'pwa-info'].includes(rawHash)) {
      navigateTo(rawHash);
      if (rawHash === 'tasks') {
        const taskId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('task');
        if (taskId) TaskManager.editTask(taskId);
      }
    } else {
      navigateTo('dashboard');
    }
  }

  /**
   * Actualiza las tarjetas de resumen y gráficos del Dashboard.
   */
  function updateDashboardStats() {
    const taskMetrics = TaskManager.getMetrics();
    const noteMetrics = NotesManager.getMetrics();

    // Contadores
    const pendingCountEl = document.getElementById('stat-pending-tasks');
    const completedCountEl = document.getElementById('stat-completed-tasks');
    const totalNotesEl = document.getElementById('stat-total-notes');
    const progressPercentEl = document.getElementById('stat-progress-percent');
    const progressBarEl = document.getElementById('stat-progress-bar');
    const urgentTasksEl = document.getElementById('stat-urgent-tasks');

    if (pendingCountEl) pendingCountEl.textContent = taskMetrics.pending;
    if (completedCountEl) completedCountEl.textContent = taskMetrics.completed;
    if (totalNotesEl) totalNotesEl.textContent = noteMetrics.total;
    if (urgentTasksEl) urgentTasksEl.textContent = taskMetrics.highPriority;

    // Cálculo del porcentaje de cumplimiento
    const totalTasks = taskMetrics.total;
    const percent = totalTasks === 0 ? 0 : Math.round((taskMetrics.completed / totalTasks) * 100);

    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;

    // Renderizar lista rápida de tareas prioritarias en Dashboard
    _renderDashboardRecent(taskMetrics.tasks, noteMetrics.notes);
  }

  /**
   * Renderiza el resumen de actividad reciente en el Dashboard.
   */
  function _renderDashboardRecent(tasks, notes) {
    const recentTasksContainer = document.getElementById('dashboard-recent-tasks');
    const recentNotesContainer = document.getElementById('dashboard-recent-notes');

    if (recentTasksContainer) {
      const pendingTasks = tasks.filter((t) => !t.completed).slice(0, 3);
      if (pendingTasks.length === 0) {
        recentTasksContainer.innerHTML = `
          <div class="empty-state-mini">
            <p>¡No tienes tareas pendientes urgentes!</p>
          </div>
        `;
      } else {
        recentTasksContainer.innerHTML = pendingTasks.map((t) => `
          <div class="dashboard-task-item">
            <span class="priority-dot priority-${['alta','media','baja'].includes(t.priority) ? t.priority : 'media'}"></span>
            <div class="task-info">
              <span class="task-name">${_escape(t.title)}</span>
              <span class="task-sub">${t.dueDate ? `Vence: ${_escape(t.dueDate)}` : 'Sin fecha'}</span>
            </div>
            <button class="btn-sm btn-outline" data-action="task-toggle" data-record-id="${_escape(String(t.id))}">
              Completar
            </button>
          </div>
        `).join('');
      }
    }

    if (recentNotesContainer) {
      const topNotes = notes.slice(0, 3);
      if (topNotes.length === 0) {
        recentNotesContainer.innerHTML = `
          <div class="empty-state-mini">
            <p>Aún no hay notas registradas.</p>
          </div>
        `;
      } else {
        recentNotesContainer.innerHTML = topNotes.map((n) => `
          <div class="dashboard-note-item" data-action="note-edit" data-record-id="${_escape(String(n.id))}">
            <div class="note-color-stripe" style="background-color: ${/^#[0-9a-f]{6}$/i.test(n.colorTag) ? n.colorTag : '#3b82f6'}"></div>
            <div class="note-info">
              <span class="note-name">${_escape(n.title)}</span>
              <span class="note-snippet">${_escape(n.content.substring(0, 60))}${n.content.length > 60 ? '...' : ''}</span>
            </div>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Configura el comportamiento global de modales (Cierre por fondo y tecla ESC).
   */
  function _bindGlobalModals() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        TaskManager.closeTaskModal();
        NotesManager.closeNoteModal();
      }
    });

    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          TaskManager.closeTaskModal();
          NotesManager.closeNoteModal();
        }
      });
    });
  }

  /**
   * Configura la apertura y cierre de la barra lateral en pantallas móviles.
   */
  function _bindMobileSidebar() {
    const toggleBtn = document.getElementById('btn-toggle-menu');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('active');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', _closeMobileSidebar);
    }
  }

  function _closeMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }

  /**
   * Sistema de Notificaciones Toast flotantes.
   * @param {string} message - Texto de la notificación.
   * @param {'info'|'success'|'warning'|'error'} type - Tipo visual del Toast.
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-message">${_escape(message)}</div>
      <button class="toast-close" aria-label="Cerrar">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 250);
    });

    container.appendChild(toast);

    // Auto-eliminar tras 4 segundos
    setTimeout(() => {
      if (toast.isConnected) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 250);
      }
    }, 4000);
  }

  function _escape(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, (m) => map[m]);
  }

  // Inicialización automática cuando el DOM está listo
  document.addEventListener('DOMContentLoaded', init);

  return {
    init,
    navigateTo,
    updateDashboardStats,
    showToast
  };
})();
