import { el, clear, mount, icon } from '../util/dom.js';

export function createCoursePicker({ onSelectionChange } = {}) {
  let courses = [];
  let selectedIds = new Set();
  let isOpen = false;
  let isLoading = false;
  let searchQuery = '';

  const root = el('div', { class: 'course-picker' });
  const triggerBtn = el('button', { class: 'course-picker-trigger', onClick: toggleOpen });
  const dropdown = el('div', { class: 'course-picker-dropdown', style: { display: 'none' } });
  
  const searchInput = el('input', {
    class: 'course-picker-search',
    type: 'text',
    placeholder: 'Search courses...',
    onInput: (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderList();
    }
  });
  
  const selectAllBtn = el('button', { class: 'btn small ghost', onClick: selectAll }, 'Select All');
  const deselectAllBtn = el('button', { class: 'btn small ghost', onClick: deselectAll }, 'Deselect All');
  const actions = el('div', { class: 'course-picker-actions' }, [selectAllBtn, deselectAllBtn]);
  
  const listEl = el('div', { class: 'course-picker-list' });

  mount(dropdown, [
    el('div', { style: { padding: '12px', borderBottom: '1px solid var(--border)' } }, searchInput),
    actions,
    listEl
  ]);

  mount(root, [triggerBtn, dropdown]);

  function toggleOpen(e) {
    if (isLoading || (courses.length === 0 && !isOpen)) return;
    if (e) e.stopPropagation();
    isOpen = !isOpen;
    dropdown.style.display = isOpen ? 'block' : 'none';
    if (isOpen) {
      searchInput.focus();
      document.addEventListener('click', handleOutsideClick);
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeydown);
    }
    updateTrigger();
  }

  function handleOutsideClick(e) {
    if (!root.contains(e.target)) toggleOpen();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) toggleOpen();
  }

  function updateTrigger() {
    clear(triggerBtn);
    if (isLoading) {
      mount(triggerBtn, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
          icon('spinner', { class: 'spin', size: 16 }),
          'Loading courses...'
        ])
      ]);
    } else if (courses.length === 0) {
      mount(triggerBtn, 'Sign in to see courses');
    } else if (selectedIds.size === 0) {
      mount(triggerBtn, `All courses (${courses.length})`);
    } else {
      mount(triggerBtn, `${selectedIds.size} of ${courses.length} selected`);
    }
  }

  function selectAll(e) {
    if (e) e.stopPropagation();
    const visible = getVisibleCourses();
    visible.forEach(c => selectedIds.add(c.id));
    notifyChange();
    renderList();
  }

  function deselectAll(e) {
    if (e) e.stopPropagation();
    const visible = getVisibleCourses();
    visible.forEach(c => selectedIds.delete(c.id));
    notifyChange();
    renderList();
  }
  
  function notifyChange() {
    updateTrigger();
    if (onSelectionChange) onSelectionChange(Array.from(selectedIds));
  }

  function getVisibleCourses() {
    if (!searchQuery) return courses;
    return courses.filter(c => {
      const matchName = c.name && c.name.toLowerCase().includes(searchQuery);
      const matchSection = c.section && c.section.toLowerCase().includes(searchQuery);
      const matchTeacher = c.teachers && c.teachers.some(t => t.name && t.name.toLowerCase().includes(searchQuery));
      return matchName || matchSection || matchTeacher;
    });
  }

  function renderList() {
    clear(listEl);
    const visible = getVisibleCourses();
    if (visible.length === 0) {
      mount(listEl, el('div', { class: 'course-picker-empty' }, 'No courses found'));
      return;
    }

    const active = visible.filter(c => c.courseState !== 'ARCHIVED');
    const archived = visible.filter(c => c.courseState === 'ARCHIVED');

    if (active.length > 0) {
      listEl.appendChild(el('div', { class: 'course-picker-divider' }, 'Active'));
      active.forEach(c => listEl.appendChild(createItem(c)));
    }
    if (archived.length > 0) {
      listEl.appendChild(el('div', { class: 'course-picker-divider' }, 'Archived'));
      archived.forEach(c => listEl.appendChild(createItem(c)));
    }
  }

  function createItem(c) {
    const isChecked = selectedIds.has(c.id);
    const checkIcon = isChecked ? icon('check', { size: 14 }) : null;
    
    const checkbox = el('div', { class: `course-picker-checkbox ${isChecked ? 'checked' : ''}` }, checkIcon);
    
    const title = el('div', { style: { fontWeight: '600', color: 'var(--text)' } }, c.name);
    const teachers = c.teachers && c.teachers.length ? el('span', { class: 'muted small' }, ' • ' + c.teachers.map(t => t.name).join(', ')) : null;
    const section = c.section ? el('span', { class: 'muted small' }, ' • ' + c.section) : null;
    const badge = c.courseState === 'ARCHIVED' ? el('span', { class: 'badge small', style: { marginLeft: '6px', fontSize: '10px', background: 'var(--bg-sunken)', padding: '2px 6px', borderRadius: '4px' } }, 'Archived') : null;

    const info = el('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' } }, [title, section, teachers, badge]);

    return el('div', {
      class: `course-picker-item ${isChecked ? 'checked' : ''}`,
      onClick: (e) => {
        e.stopPropagation();
        if (isChecked) selectedIds.delete(c.id);
        else selectedIds.add(c.id);
        notifyChange();
        renderList();
      }
    }, [checkbox, info]);
  }

  updateTrigger();

  return {
    root,
    setCourses: (c) => {
      courses = c || [];
      selectedIds.clear();
      isLoading = false;
      searchQuery = '';
      searchInput.value = '';
      renderList();
      updateTrigger();
    },
    getSelectedIds: () => Array.from(selectedIds),
    setLoading: (loading) => {
      isLoading = loading;
      updateTrigger();
    },
    destroy: () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeydown);
    }
  };
}
