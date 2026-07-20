import { el, clear, mount, icon, providerIcon } from '../util/dom.js';
import { bytesToSize, formatDate, dueLabel, providerLabel, materialTypeLabel } from '../util/format.js';
import { countGraph } from '../archive/format.js';
import { applyFilters, emptyFilters, collectTypes, collectProviders } from './filters.js';
import { openAttachment } from './preview.js';

/**
 * The interactive dashboard: course sidebar + searchable, filterable content.
 * Returns a DOM node. Re-renders only the content region on filter changes so
 * the search box keeps focus.
 */
export function renderViewer(loaded) {
  const graph = loaded.graph;
  const filters = emptyFilters();
  let selectedCourseId = null; // null → all courses

  const allTypes = collectTypes(graph);
  const allProviders = collectProviders(graph);

  const sidebar = el('aside', { class: 'sidebar' });
  const content = el('div', { class: 'view-content' });

  // ---- Toolbar (built once, persistent) ----
  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Search courses, assignments, files…',
    'aria-label': 'Search',
    oninput: () => {
      filters.query = searchInput.value;
      renderContent();
    }
  });
  const typeChips = allTypes.map((t) =>
    chip(materialTypeLabel(t), () => toggleIn(filters.types, t), () => filters.types.includes(t))
  );
  const providerChips = allProviders.map((p) =>
    chip(providerLabel(p), () => toggleIn(filters.providers, p), () => filters.providers.includes(p))
  );
  const downloadedChip = chip('Downloaded only', () => {
    filters.downloadedOnly = !filters.downloadedOnly;
  }, () => filters.downloadedOnly);

  const filterRow = el('div', { class: 'filter-row' }, [
    allTypes.length ? el('span', { class: 'filter-label' }, 'Type') : null,
    ...typeChips,
    allProviders.length ? el('span', { class: 'filter-label', style: { marginLeft: '6px' } }, 'Source') : null,
    ...providerChips,
    loaded.hasFiles ? downloadedChip : null
  ]);

  const toolbar = el('div', { class: 'toolbar' }, [
    el('div', { class: 'searchbar' }, [
      el('label', { class: 'search-input' }, [icon('search', { size: 18 }), searchInput])
    ]),
    filterRow
  ]);

  function chip(label, onToggle, isActive) {
    const node = el('button', { class: 'chip', onClick: () => { onToggle(); node.classList.toggle('active'); renderContent(); } }, label);
    if (isActive()) node.classList.add('active');
    return node;
  }
  function toggleIn(arr, value) {
    const i = arr.indexOf(value);
    if (i === -1) arr.push(value); else arr.splice(i, 1);
  }

  // ---- Sidebar ----
  function renderSidebar() {
    const counts = countGraph(graph);
    const items = [el('div', { class: 'sidebar-title' }, `Courses · ${counts.courses}`)];
    items.push(courseItem({ id: null, name: 'All courses', count: counts.materials }, selectedCourseId === null, 'home'));
    for (const c of graph.courses) {
      let items2 = 0;
      for (const t of c.topics) items2 += t.materials.length;
      items.push(courseItem({ id: c.id, name: c.name, count: items2 }, selectedCourseId === c.id, 'book'));
    }
    mount(sidebar, items);
  }
  function courseItem(course, active, iconName) {
    return el('div', {
      class: `course-item${active ? ' active' : ''}`,
      onClick: () => {
        selectedCourseId = course.id;
        filters.courseId = course.id;
        renderSidebar();
        renderContent();
        sidebar.parentElement?.querySelector('.main')?.scrollTo?.({ top: 0 });
      }
    }, [
      icon(iconName, { size: 17 }),
      el('span', { class: 'ci-name' }, course.name),
      el('span', { class: 'ci-count' }, String(course.count))
    ]);
  }

  // ---- Content ----
  function renderContent() {
    const filtered = applyFilters(graph, filters);
    const counts = countGraph(filtered);

    if (!filtered.courses.length) {
      mount(content, emptyState('No matching items', 'Try clearing the search or filters.'));
      return;
    }

    const nodes = [];
    // Stats only in "all" view; a single course shows its own hero.
    if (selectedCourseId === null) {
      nodes.push(statRow(counts, loaded.hasFiles));
    }
    for (const course of filtered.courses) {
      nodes.push(renderCourse(course));
    }
    mount(content, nodes);
  }

  function renderCourse(course) {
    const children = [courseHero(course)];
    const visibleTopics = course.topics.filter((t) => t.materials.length);
    if (!visibleTopics.length) {
      children.push(emptyState('Nothing here yet', 'No items match the current filters in this course.'));
    }
    for (const topic of visibleTopics) {
      children.push(renderTopic(topic));
    }
    return el('section', { style: { marginBottom: '32px' } }, children);
  }

  function renderTopic(topic) {
    return el('div', { class: 'topic' }, [
      el('div', { class: 'topic-head' }, [
        icon('folder', { size: 15 }),
        topic.title,
        el('span', { class: 'th-line' }),
        el('span', { class: 'small muted' }, `${topic.materials.length}`)
      ]),
      ...topic.materials.map(renderMaterial)
    ]);
  }

  function renderMaterial(mat) {
    const type = (mat.type || 'material').toLowerCase();
    const iconName = type === 'announcement' ? 'clipboard' : type === 'material' ? 'book' : 'clipboard';
    const meta = [el('span', { class: `badge type-${type}` }, materialTypeLabel(type))];
    if (mat.due_date) {
      meta.push(el('span', { class: 'badge due' }, [icon('calendar', { size: 13 }), dueLabel(mat.due_date) || formatDate(mat.due_date)]));
    }
    if (mat.source_url) {
      meta.push(el('a', { class: 'badge', href: mat.source_url, target: '_blank', rel: 'noopener' }, [icon('external', { size: 13 }), 'Open in Classroom']));
    }

    const body = [
      el('div', { class: 'material-title' }, mat.title),
      el('div', { class: 'material-meta' }, meta)
    ];
    if (mat.description) body.push(el('div', { class: 'material-desc' }, mat.description));
    if (mat.attachments.length) {
      body.push(el('div', { class: 'attach-list' }, mat.attachments.map(renderAttachment)));
    }

    return el('div', { class: 'material' }, [
      el('div', { class: 'material-head' }, [
        el('div', { class: `material-icon ${type}` }, icon(iconName, { size: 19 })),
        el('div', { class: 'material-body' }, body)
      ])
    ]);
  }

  function renderAttachment(att) {
    const downloaded = att.status === 'complete' && att.local_path;
    const classes = ['attach'];
    if (downloaded) classes.push('downloaded');
    if (!downloaded && !att.source_url && !att.download_url) classes.push('reference');
    const sub = downloaded
      ? `${providerLabel(att.provider)} · ${bytesToSize(att.bytes)}`
      : att.source_url || att.download_url ? `${providerLabel(att.provider)} · opens source` : providerLabel(att.provider);

    return el('button', {
      class: classes.join(' '),
      title: att.filename,
      onClick: () => openAttachment(loaded, att)
    }, [
      el('div', { class: 'attach-ic' }, icon(providerIcon(att.provider), { size: 16 })),
      el('div', { class: 'attach-info' }, [
        el('div', { class: 'attach-name' }, att.filename),
        el('div', { class: 'attach-sub' }, sub)
      ]),
      icon(downloaded ? 'eye' : 'external', { size: 15 })
    ]);
  }

  function courseHero(course) {
    const meta = [];
    if (course.teacher) meta.push(el('span', {}, [icon('book', { size: 15 }), course.teacher]));
    if (course.section) meta.push(el('span', {}, [icon('folder', { size: 15 }), course.section]));
    if (course.room) meta.push(el('span', {}, [icon('home', { size: 15 }), `Room ${course.room}`]));
    if (course.created_at) meta.push(el('span', {}, [icon('calendar', { size: 15 }), formatDate(course.created_at)]));
    const children = [el('h1', {}, course.name)];
    if (meta.length) children.push(el('div', { class: 'ch-meta' }, meta));
    if (course.description) children.push(el('div', { class: 'ch-desc' }, course.description));
    return el('div', { class: 'course-hero' }, children);
  }

  renderSidebar();
  renderContent();

  const main = el('main', { class: 'main' }, [
    el('div', { class: 'main-inner' }, [toolbar, content])
  ]);
  return el('div', { class: 'viewer' }, [sidebar, main]);
}

function statRow(counts, hasFiles) {
  const stats = [
    ['Courses', counts.courses],
    ['Items', counts.materials],
    ['Attachments', counts.attachments]
  ];
  if (hasFiles) stats.push(['Downloaded', bytesToSize(counts.bytes)]);
  return el('div', { class: 'stat-row' }, stats.map(([label, val]) =>
    el('div', { class: 'stat' }, [
      el('div', { class: 's-val' }, String(val)),
      el('div', { class: 's-label' }, label)
    ])
  ));
}

function emptyState(title, subtitle) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty-ic' }, icon('search', { size: 40 })),
    el('h3', {}, title),
    el('p', { class: 'muted' }, subtitle)
  ]);
}
