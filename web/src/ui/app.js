import { el, clear, mount, icon } from '../util/dom.js';
import { config } from '../../config.js';
import { initTheme, toggleTheme, currentTheme } from './theme.js';
import { toast } from './toast.js';
import { renderLanding } from './landing.js';
import { renderScraper } from './scraperView.js';
import { renderViewer } from './viewer.js';
import { importFile, importFromUrl, importFromShareData } from '../archive/importer.js';
import { exportZip, exportJson, triggerDownload, suggestFilename, buildInlineShareLink } from '../archive/exporter.js';

const state = { loaded: null };
let appRoot;
let contentRoot;

export function startApp(rootEl) {
  appRoot = rootEl;
  initTheme();
  mount(appRoot, [renderTopbar(), (contentRoot = el('div', { class: 'content' }))]);
  window.addEventListener('hashchange', route);
  route();
}

// ---------- Top bar ----------
function renderTopbar() {
  const actions = el('div', { class: 'topbar-actions' });
  const bar = el('header', { class: 'topbar' }, [
    el('div', { class: 'brand', onClick: () => navigate('#/') }, [
      el('div', { class: 'brand-mark' }, icon('archive', { size: 20 })),
      el('div', { class: 'brand-name' }, config.appName),
      el('span', { class: 'brand-badge' }, `v${config.version}`)
    ]),
    el('div', { class: 'topbar-spacer' }),
    actions
  ]);
  bar._actions = actions;
  refreshTopbarActions(bar);
  appRoot._topbar = bar;
  return bar;
}

function refreshTopbarActions(bar = appRoot?._topbar) {
  if (!bar) return;
  const actions = bar._actions;
  const children = [];
  if (state.loaded) {
    children.push(el('button', { class: 'btn subtle sm', onClick: openExportMenu }, [icon('download', { size: 16 }), 'Export']));
    children.push(el('button', { class: 'btn subtle sm', onClick: openShare }, [icon('share', { size: 16 }), 'Share']));
    children.push(el('button', { class: 'btn ghost sm', onClick: closeArchive, title: 'Close archive' }, [icon('x', { size: 16 })]));
  }
  children.push(themeButton());
  mount(actions, children);
}

function themeButton() {
  const btn = el('button', { class: 'icon-btn', title: 'Toggle theme' }, icon(currentTheme() === 'dark' ? 'sun' : 'moon', { size: 18 }));
  btn.addEventListener('click', () => { toggleTheme(); mount(btn, icon(currentTheme() === 'dark' ? 'sun' : 'moon', { size: 18 })); });
  return btn;
}

// ---------- Routing ----------
function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(queryStr || '') };
}

async function route() {
  const { path, params } = parseHash();

  if (path === '/scrape') {
    setLoaded(null);
    return show(renderScraper({ onComplete: (loaded) => { setLoaded(loaded); navigate('#/view'); } }));
  }

  if (path === '/demo') {
    return loadInto(() => importFromUrl(new URL('sample/demo-archive.json', document.baseURI).toString()), 'Loading demo…');
  }

  if (path === '/view') {
    if (params.get('data')) {
      return loadInto(() => importFromShareData(params.get('data')), 'Opening shared archive…');
    }
    if (params.get('src')) {
      return loadInto(() => importFromUrl(params.get('src')), 'Loading archive…');
    }
    if (state.loaded) return show(renderViewer(state.loaded));
    return loadInto(() => importFromUrl(new URL('sample/demo-archive.json', document.baseURI).toString()), 'Opening viewer…');
  }

  // Landing
  setLoaded(null);
  show(renderLanding({
    onFile: (file) => loadInto(() => importFile(file), 'Opening archive…'),
    onUrl: (url) => { navigate(`#/view?src=${encodeURIComponent(url)}`); },
    onDemo: () => navigate('#/demo'),
    onScrape: () => navigate('#/scrape')
  }));
}

async function loadInto(loader, message) {
  show(loadingScreen(message));
  try {
    const loaded = await loader();
    setLoaded(loaded);
    show(renderViewer(loaded));
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not open that archive.', 'error', 6000);
    setLoaded(null);
    // Fall back to landing without a redirect loop.
    show(renderLanding({
      onFile: (file) => loadInto(() => importFile(file), 'Opening archive…'),
      onUrl: (url) => navigate(`#/view?src=${encodeURIComponent(url)}`),
      onDemo: () => navigate('#/demo'),
      onScrape: () => navigate('#/scrape')
    }));
  }
}

function setLoaded(loaded) {
  if (state.loaded && state.loaded !== loaded) state.loaded.dispose?.();
  state.loaded = loaded;
  refreshTopbarActions();
}

function closeArchive() {
  setLoaded(null);
  navigate('#/');
}

function show(node) {
  mount(contentRoot, node);
}

function loadingScreen(message) {
  return el('div', { class: 'empty', style: { paddingTop: '120px' } }, [
    el('div', { class: 'empty-ic' }, icon('spinner', { size: 40, class: 'spin' })),
    el('h3', {}, message || 'Loading…')
  ]);
}

// ---------- Export & Share ----------
function loadedFilesForExport() {
  // Convert LoadedArchive.files (Map path→Blob) into the exporter's shape.
  const files = new Map();
  for (const [path, blob] of state.loaded.files.entries()) files.set(path, { blob });
  return files;
}

function openExportMenu() {
  const overlay = modalShell('Export archive');
  const body = overlay._body;
  const hasFiles = state.loaded.hasFiles;
  mount(body, [
    exportOption('download', 'Download .zip', hasFiles
      ? 'Complete archive with all downloaded files included. Best for backups and sharing.'
      : 'Archive structure and metadata (this archive has no bundled files).', async (btn) => {
      btn.disabled = true;
      mount(btn, [icon('spinner', { size: 16, class: 'spin' }), 'Packaging…']);
      try {
        const blob = await exportZip(state.loaded.archive, loadedFilesForExport(), {
          onProgress: (p) => { if (p.message) mount(btn, [icon('spinner', { size: 16, class: 'spin' }), p.message]); }
        });
        triggerDownload(blob, suggestFilename(state.loaded.archive, 'zip'));
        overlay.remove();
        toast('Archive downloaded.', 'success');
      } catch (err) {
        toast(err.message, 'error', 6000);
        btn.disabled = false;
        mount(btn, 'Download .zip');
      }
    }),
    exportOption('file', 'Download .json', 'Lightweight metadata only (no files). Great for a quick, tiny backup or to re-share structure.', (btn) => {
      triggerDownload(exportJson(state.loaded.archive), suggestFilename(state.loaded.archive, 'json'));
      overlay.remove();
      toast('JSON downloaded.', 'success');
    })
  ]);
}

async function openShare() {
  const overlay = modalShell('Share archive');
  const body = overlay._body;
  mount(body, [
    el('div', { class: 'empty', style: { padding: '20px 0' } }, [
      icon('spinner', { size: 30, class: 'spin' }),
      el('div', { style: { marginTop: '10px' } }, 'Generating link…')
    ])
  ]);
  const inline = await buildInlineShareLink(state.loaded.archive);
  const children = [];

  if (inline.ok) {
    children.push(el('p', { class: 'small muted' }, 'Anyone with this link can view the courses, assignments and structure — no login or install. Files are not included in a link; use the .zip to share downloaded files.'));
    children.push(linkRow(inline.url));
  } else {
    children.push(el('div', { class: 'notice' }, [icon('info', { size: 18 }), inline.reason]));
  }
  children.push(el('div', { class: 'divider-or', style: { margin: '18px 0' } }, 'to share files too'));
  children.push(el('p', { class: 'small muted' }, [
    'Download the ', el('strong', {}, '.zip'), ' (Export → Download .zip), upload it anywhere public (GitHub, Drive, Dropbox…), then share a link like:'
  ]));
  children.push(el('div', { class: 'mono', style: { padding: '10px 12px', background: 'var(--bg-sunken)', borderRadius: '8px', wordBreak: 'break-all' } },
    `${location.origin}${location.pathname}#/view?src=<link-to-your-zip>`));
  mount(body, children);
}

function linkRow(url) {
  const input = el('input', {
    type: 'text', value: url, readonly: true,
    style: { flex: '1', height: '40px', padding: '0 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-sunken)', color: 'var(--text)' },
    onClick: (e) => e.target.select()
  });
  const copyBtn = el('button', { class: 'btn primary', onClick: async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied!', 'success'); }
    catch { input.select(); toast('Press Ctrl/Cmd+C to copy.', 'default'); }
  } }, [icon('share', { size: 16 }), 'Copy']);
  return el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, [input, copyBtn]);
}

function exportOption(iconName, title, desc, onClick) {
  const btn = el('button', {
    class: 'panel', style: {
      display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', width: '100%',
      padding: '14px 16px', marginBottom: '10px', cursor: 'pointer', color: 'var(--text)', font: 'inherit'
    }
  }, [
    el('div', { style: { display: 'grid', placeItems: 'center', width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-soft)', color: 'var(--primary-strong)', flexShrink: '0' } }, icon(iconName, { size: 20 })),
    el('div', {}, [el('div', { style: { fontWeight: '650' } }, title), el('div', { class: 'small muted' }, desc)])
  ]);
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

function modalShell(title) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const body = el('div', { style: { padding: '18px' } });
  const modal = el('div', { class: 'modal', style: { width: 'min(560px, 100%)' } }, [
    el('div', { class: 'modal-head' }, [
      el('div', { class: 'm-title' }, title),
      el('button', { class: 'icon-btn', onClick: close }, icon('x', { size: 18 }))
    ]),
    body
  ]);
  clear(overlay).appendChild(modal);
  document.body.appendChild(overlay);
  overlay._body = body;
  return overlay;
}
