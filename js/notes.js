/**
 * ==============================================================================
 * MÓDULO DE GESTIÓN DE NOTAS - PWA LIFE
 * ==============================================================================
 * 
 * Controla la lógica de:
 * - Creación, edición, eliminación y visualización de notas.
 * - Clasificación por categorías (Académico, Trabajo, Personal, Ideas).
 * - Búsqueda en tiempo real sobre título y cuerpo de texto.
 * - Persistencia local mediante StorageEngine.
 * ==============================================================================
 */

const NotesManager = (() => {
  let notes = [];
  let currentCategory = 'all';
  let searchQuery = '';

  let notesContainer = null;
  let noteModal = null;
  let noteForm = null;
  let categoryFilterButtons = [];
  let searchInput = null;

  async function init() {
    notesContainer = document.getElementById('notes-container');
    noteModal = document.getElementById('note-modal');
    noteForm = document.getElementById('note-form');
    categoryFilterButtons = document.querySelectorAll('.note-filter-btn');
    searchInput = document.getElementById('note-search-input');

    await loadNotes();
    _bindEvents();
    renderNotes();
  }

  async function loadNotes() {
    notes = await StorageEngine.getNotes();
    // Ordenar de más reciente a más antigua
    notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function _bindEvents() {
    if (noteForm) {
      noteForm.addEventListener('submit', _handleFormSubmit);
    }

    categoryFilterButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        categoryFilterButtons.forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentCategory = e.currentTarget.dataset.category;
        renderNotes();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderNotes();
      });
    }

    const newNoteBtn = document.getElementById('btn-new-note');
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => openNoteModal());
    }

    const closeBtn = document.getElementById('btn-close-note-modal');
    const cancelBtn = document.getElementById('btn-cancel-note');
    if (closeBtn) closeBtn.addEventListener('click', closeNoteModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeNoteModal);
  }

  async function _handleFormSubmit(e) {
    e.preventDefault();

    const noteId = document.getElementById('note-id').value;
    const title = document.getElementById('note-title').value.trim();
    const category = document.getElementById('note-category').value;
    const content = document.getElementById('note-content').value.trim();

    if (!title) {
      App.showToast('El título de la nota es obligatorio', 'error');
      return;
    }

    if (!content) {
      App.showToast('El contenido de la nota no puede estar vacío', 'error');
      return;
    }

    // Paleta de colores suaves según la categoría
    const categoryColors = {
      'Académico': '#3b82f6',
      'Trabajo': '#6366f1',
      'Personal': '#10b981',
      'Ideas': '#f59e0b'
    };

    const isEdit = Boolean(noteId);
    const existingNote = isEdit ? notes.find((n) => n.id === noteId) : null;

    const noteData = {
      id: isEdit ? noteId : `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      category: category || 'Personal',
      colorTag: categoryColors[category] || '#3b82f6',
      content,
      createdAt: existingNote ? existingNote.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await StorageEngine.saveNote(noteData);
      await loadNotes();
      renderNotes();
      closeNoteModal();

      App.updateDashboardStats();
      App.showToast(isEdit ? 'Nota actualizada exitosamente' : 'Nota guardada exitosamente', 'success');
    } catch (err) {
      console.error('Error al guardar la nota:', err);
      App.showToast(err.message || 'Error al persistir la nota', 'error');
    }
  }

  async function deleteNote(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta nota?')) return;

    try {
      await StorageEngine.deleteNote(id);
      await loadNotes();
      renderNotes();
      App.updateDashboardStats();
      App.showToast('Nota eliminada correctamente', 'info');
    } catch (err) {
      console.error('Error al eliminar la nota:', err);
      App.showToast('Error al eliminar la nota', 'error');
    }
  }

  function openNoteModal(note = null) {
    if (!noteModal || !noteForm) return;

    noteForm.reset();
    const modalTitle = document.getElementById('note-modal-title');

    if (note) {
      modalTitle.textContent = 'Editar Nota';
      document.getElementById('note-id').value = note.id;
      document.getElementById('note-title').value = note.title;
      document.getElementById('note-category').value = note.category;
      document.getElementById('note-content').value = note.content;
    } else {
      modalTitle.textContent = 'Crear Nueva Nota';
      document.getElementById('note-id').value = '';
    }

    noteModal.classList.add('active');
  }

  function closeNoteModal() {
    if (noteModal) {
      noteModal.classList.remove('active');
    }
  }

  function editNote(id) {
    const note = notes.find((n) => n.id === id);
    if (note) {
      openNoteModal(note);
    }
  }

  function renderNotes() {
    if (!notesContainer) return;

    let filtered = [...notes];

    if (currentCategory !== 'all') {
      filtered = filtered.filter((n) => n.category === currentCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter((n) =>
        n.title.toLowerCase().includes(searchQuery) ||
        n.content.toLowerCase().includes(searchQuery)
      );
    }

    if (filtered.length === 0) {
      notesContainer.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p class="empty-title">No hay notas registradas</p>
          <p class="empty-desc">${searchQuery ? 'No hubo coincidencias con la búsqueda.' : 'Registra tus ideas, conceptos o apuntes aquí.'}</p>
        </div>
      `;
      return;
    }

    notesContainer.innerHTML = filtered.map((note) => {
      const formattedDate = _formatTimestamp(note.createdAt);
      const color = /^#[0-9a-f]{6}$/i.test(note.colorTag) ? note.colorTag : '#3b82f6';
      return `
        <article class="note-card" style="border-top: 4px solid ${color}">
          <div class="note-header">
            <span class="badge badge-category" style="background-color: ${color}1a; color: ${color}; border: 1px solid ${color}33;">
              ${_escapeHtml(note.category)}
            </span>
            <div class="note-actions">
              <button class="btn-action edit" title="Editar Nota" data-action="note-edit" data-record-id="${_escapeHtml(String(note.id))}" aria-label="Editar">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-action delete" title="Eliminar Nota" data-action="note-delete" data-record-id="${_escapeHtml(String(note.id))}" aria-label="Eliminar">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>

          <h3 class="note-title">${_escapeHtml(note.title)}</h3>
          <p class="note-content-preview">${_escapeHtml(note.content)}</p>

          <div class="note-footer">
            <span class="meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${formattedDate}
            </span>
          </div>
        </article>
      `;
    }).join('');
  }

  function _formatTimestamp(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return isoString;
    }
  }

  function _escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, (m) => map[m]);
  }

  function getMetrics() {
    return {
      total: notes.length,
      notes
    };
  }

  return {
    init,
    openNoteModal,
    closeNoteModal,
    deleteNote,
    editNote,
    getMetrics,
    loadNotes,
    renderNotes
  };
})();
