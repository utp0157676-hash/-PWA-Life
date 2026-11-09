/**
 * ==============================================================================
 * MÓDULO DE GESTIÓN DE TAREAS - PWA LIFE
 * ==============================================================================
 * 
 * Controla la lógica de negocio para:
 * - Creación, edición, eliminación y cambio de estado de tareas.
 * - Filtrado dinámico (Todas, Pendientes, Completadas, por Prioridad).
 * - Búsqueda en tiempo real por título y descripción.
 * - Persistencia asíncrona mediante StorageEngine.
 * ==============================================================================
 */

const TaskManager = (() => {
  let tasks = [];
  let currentFilter = 'all'; // 'all', 'pending', 'completed'
  let currentPriorityFilter = 'all'; // 'all', 'alta', 'media', 'baja'
  let searchQuery = '';

  // Elementos del DOM
  let taskListContainer = null;
  let taskModal = null;
  let taskForm = null;
  let filterButtons = [];
  let prioritySelectFilter = null;
  let searchInput = null;

  /**
   * Inicializa el módulo de tareas y enlaza eventos.
   */
  async function init() {
    taskListContainer = document.getElementById('tasks-container');
    taskModal = document.getElementById('task-modal');
    taskForm = document.getElementById('task-form');
    filterButtons = document.querySelectorAll('.task-filter-btn');
    prioritySelectFilter = document.getElementById('task-priority-filter');
    searchInput = document.getElementById('task-search-input');

    await loadTasks();
    _bindEvents();
    renderTasks();
  }

  /**
   * Carga las tareas desde el motor de almacenamiento local.
   */
  async function loadTasks() {
    tasks = await StorageEngine.getTasks();
    // Ordenar: incompletas primero, luego por fecha de vencimiento
    tasks.sort((a, b) => {
      if (a.completed === b.completed) {
        return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
      }
      return a.completed ? 1 : -1;
    });
  }

  /**
   * Registra los controladores de eventos para formularios, filtros y búsqueda.
   */
  function _bindEvents() {
    // Formulario de guardar tarea (Crear / Editar)
    if (taskForm) {
      taskForm.addEventListener('submit', _handleFormSubmit);
    }

    // Botones de filtro de estado (Todas, Pendientes, Completadas)
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        filterButtons.forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentFilter = e.currentTarget.dataset.filter;
        renderTasks();
      });
    });

    // Filtro por prioridad
    if (prioritySelectFilter) {
      prioritySelectFilter.addEventListener('change', (e) => {
        currentPriorityFilter = e.target.value;
        renderTasks();
      });
    }

    // Búsqueda en tiempo real
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderTasks();
      });
    }

    // Botón para abrir modal de nueva tarea
    const newTaskBtn = document.getElementById('btn-new-task');
    if (newTaskBtn) {
      newTaskBtn.addEventListener('click', () => openTaskModal());
    }

    // Botón cerrar modal
    const closeBtn = document.getElementById('btn-close-task-modal');
    const cancelBtn = document.getElementById('btn-cancel-task');
    if (closeBtn) closeBtn.addEventListener('click', closeTaskModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeTaskModal);
  }

  /**
   * Procesa la sumisión del formulario de tarea.
   */
  async function _handleFormSubmit(e) {
    e.preventDefault();

    const taskId = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const priority = document.getElementById('task-priority').value;
    const dueDate = document.getElementById('task-due-date').value;
    const dueTime = document.getElementById('task-due-time').value;

    if (!title) {
      App.showToast('El título de la tarea es obligatorio', 'error');
      return;
    }

    const isEdit = Boolean(taskId);
    const existingTask = isEdit ? tasks.find((t) => t.id === taskId) : null;
    let dueAt = null;
    let timeZone = null;
    if (dueTime) {
      if (!dueDate) { App.showToast('Selecciona una fecha para la hora de vencimiento.', 'error'); return; }
      timeZone = existingTask?.dueDate === dueDate && existingTask?.dueTime === dueTime ? existingTask.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      try { dueAt = existingTask?.dueDate === dueDate && existingTask?.dueTime === dueTime ? existingTask.dueAt : NotificationCore.iso(NotificationCore.wallTime(dueDate,dueTime,timeZone)); }
      catch(error) { App.showToast(error.message,'error'); return; }
    }

    const taskData = {
      id: isEdit ? taskId : `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      description,
      priority: priority || 'media',
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      dueAt,
      timeZone,
      reminderMinutes: document.getElementById('task-reminder').value === '' ? null : Number(document.getElementById('task-reminder').value),
      notificationsEnabled: document.getElementById('task-notifications').checked,
      snoozedUntil: existingTask?.dueAt === dueAt ? existingTask?.snoozedUntil || null : null,
      completed: existingTask ? existingTask.completed : false,
      createdAt: existingTask ? existingTask.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await StorageEngine.saveTask(taskData);
      await loadTasks();
      renderTasks();
      closeTaskModal();

      App.updateDashboardStats();
      App.showToast(isEdit ? 'Tarea actualizada correctamente' : 'Tarea creada exitosamente', 'success');
    } catch (err) {
      console.error('Error al guardar la tarea:', err);
      App.showToast(err.message || 'Error al persistir la tarea', 'error');
    }
  }

  /**
   * Alterna el estado completado de una tarea.
   */
  async function toggleTaskStatus(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const updatedTask = { ...task, completed: !task.completed, updatedAt: new Date().toISOString() };
    try {
      await StorageEngine.saveTask(updatedTask);
      await loadTasks();
      renderTasks();
      App.updateDashboardStats();
      App.showToast(updatedTask.completed ? 'Tarea marcada como completada' : 'Tarea marcada como pendiente', 'info');
    } catch (err) {
      console.error('Error al actualizar la tarea:', err);
      App.showToast('Error al actualizar la tarea', 'error');
    }
  }

  /**
   * Elimina una tarea previo aviso.
   */
  async function deleteTask(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarea?')) return;

    try {
      await StorageEngine.deleteTask(id);
      await loadTasks();
      renderTasks();
      App.updateDashboardStats();
      App.showToast('Tarea eliminada correctamente', 'info');
    } catch (err) {
      console.error('Error al eliminar la tarea:', err);
      App.showToast('Error al eliminar la tarea', 'error');
    }
  }

  /**
   * Abre el modal para crear o editar una tarea.
   */
  function openTaskModal(task = null) {
    if (!taskModal || !taskForm) return;

    taskForm.reset();
    const modalTitle = document.getElementById('task-modal-title');

    if (task) {
      modalTitle.textContent = 'Editar Tarea';
      document.getElementById('task-id').value = task.id;
      document.getElementById('task-title').value = task.title;
      document.getElementById('task-description').value = task.description || '';
      document.getElementById('task-priority').value = task.priority;
      document.getElementById('task-due-date').value = task.dueDate || '';
      document.getElementById('task-due-time').value = task.dueTime || '';
      document.getElementById('task-reminder').value = task.reminderMinutes ?? '';
      document.getElementById('task-notifications').checked = task.notificationsEnabled !== false;
    } else {
      modalTitle.textContent = 'Crear Nueva Tarea';
      document.getElementById('task-id').value = '';
      // Fecha predeterminada de hoy
      document.getElementById('task-due-date').value = NotificationCore.dateInZone(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
    }

    taskModal.classList.add('active');
    document.getElementById('task-time-zone').textContent = 'Zona horaria: ' + (task?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone) + '. Sin hora, se conserva como fecha de calendario.';
  }

  function closeTaskModal() {
    if (taskModal) {
      taskModal.classList.remove('active');
    }
  }

  /**
   * Renderiza las tarjetas de tareas aplicando los filtros activos.
   */
  function renderTasks() {
    if (!taskListContainer) return;

    let filtered = [...tasks];

    // Filtro por estado
    if (currentFilter === 'pending') {
      filtered = filtered.filter((t) => !t.completed);
    } else if (currentFilter === 'completed') {
      filtered = filtered.filter((t) => t.completed);
    }

    // Filtro por prioridad
    if (currentPriorityFilter !== 'all') {
      filtered = filtered.filter((t) => t.priority === currentPriorityFilter);
    }

    // Filtro por búsqueda
    if (searchQuery) {
      filtered = filtered.filter((t) =>
        t.title.toLowerCase().includes(searchQuery) ||
        (t.description && t.description.toLowerCase().includes(searchQuery))
      );
    }

    // Si no hay tareas que coincidan
    if (filtered.length === 0) {
      taskListContainer.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p class="empty-title">No se encontraron tareas</p>
          <p class="empty-desc">${searchQuery ? 'Prueba con otros términos de búsqueda.' : 'Crea tu primera tarea para comenzar.'}</p>
        </div>
      `;
      return;
    }

    taskListContainer.innerHTML = filtered.map((task) => {
      const priority = ['alta','media','baja'].includes(task.priority) ? task.priority : 'media';
      const priorityClass = `priority-${priority}`;
      const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
      const isCompleted = task.completed;
      const formattedDate = task.dueAt ? new Date(task.dueAt).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' }) : (task.dueDate ? _formatDate(task.dueDate) : 'Sin fecha límite');

      return `
        <article class="task-card ${isCompleted ? 'completed' : ''}" data-id="${_escapeHtml(String(task.id))}">
          <div class="task-checkbox-wrap">
            <button type="button" 
                    class="task-check-btn ${isCompleted ? 'checked' : ''}" 
                    aria-label="${isCompleted ? 'Marcar como pendiente' : 'Marcar como completada'}"
                    data-action="task-toggle" data-record-id="${_escapeHtml(String(task.id))}">
              ${isCompleted ? `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ` : ''}
            </button>
          </div>

          <div class="task-content">
            <div class="task-header-row">
              <h3 class="task-title ${isCompleted ? 'line-through' : ''}">${_escapeHtml(task.title)}</h3>
              <span class="badge ${priorityClass}">Prioridad ${priorityLabel}</span>
            </div>
            ${task.description ? `<p class="task-desc">${_escapeHtml(task.description)}</p>` : ''}
            <div class="task-meta">
              <span class="meta-item">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${_escapeHtml(formattedDate)}
              </span>
              <span class="meta-item ${isCompleted ? 'status-done' : 'status-pending'}">
                ${isCompleted ? 'Completada' : 'Pendiente'}
              </span>
            </div>
          </div>

          <div class="task-actions">
            <button class="btn-action edit" title="Editar Tarea" data-action="task-edit" data-record-id="${_escapeHtml(String(task.id))}" aria-label="Editar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-action delete" title="Eliminar Tarea" data-action="task-delete" data-record-id="${_escapeHtml(String(task.id))}" aria-label="Eliminar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function editTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      openTaskModal(task);
    }
  }

  function _formatDate(dateString) {
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }

  function _escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, (m) => map[m]);
  }

  function getMetrics() {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const highPriority = tasks.filter((t) => !t.completed && t.priority === 'alta').length;

    return { total, completed, pending, highPriority, tasks };
  }

  return {
    init,
    openTaskModal,
    closeTaskModal,
    toggleTaskStatus,
    deleteTask,
    editTask,
    getMetrics,
    loadTasks,
    renderTasks
  };
})();
