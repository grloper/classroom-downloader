import { el, icon } from '../util/dom.js';
import { toast } from './toast.js';

/**
 * Landing / import screen. Zero setup: drop a .zip or .json archive, try the
 * live demo, or start a new scrape. `handlers` = { onFile, onUrl, onDemo, onScrape }.
 */
export function renderLanding(handlers) {
  const fileInput = el('input', {
    type: 'file',
    accept: '.zip,.json,application/zip,application/json',
    style: { display: 'none' },
    onChange: (e) => {
      const file = e.target.files?.[0];
      if (file) handlers.onFile(file);
      e.target.value = '';
    }
  });

  const dropzone = el('div', {
    class: 'dropzone',
    role: 'button',
    tabindex: '0',
    onClick: () => fileInput.click(),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); },
    ondragover: (e) => { e.preventDefault(); dropzone.classList.add('drag'); },
    ondragleave: () => dropzone.classList.remove('drag'),
    ondrop: (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) handlers.onFile(file);
      else toast('Please drop a .zip or .json archive file.', 'error');
    }
  }, [
    el('div', { class: 'dz-icon' }, icon('upload', { size: 40 })),
    el('h3', {}, 'Open an archive'),
    el('p', {}, 'Drag a .zip or .json export here, or click to browse.'),
    fileInput
  ]);

  const features = el('div', { class: 'feature-grid' }, [
    feature('archive', 'Everything in one place', 'Courses, topics, assignments, announcements, and attachments — organized and searchable.'),
    feature('download', 'Download & keep', 'Package a whole classroom into a single .zip with the files included. Yours forever.'),
    feature('share', 'Share with anyone', 'Send a link or the .zip. They open it here — no account, no install, no setup.')
  ]);

  return el('div', { class: 'landing' }, [
    el('div', { class: 'hero' }, [
      el('h1', {}, 'Your Google Classroom, archived beautifully.'),
      el('p', {}, 'Back up, browse, and share your classroom content in one clean place — right in your browser. Nothing is uploaded to any server.'),
      el('div', { class: 'cta-row' }, [
        el('button', { class: 'btn primary', onClick: handlers.onScrape }, [icon('download', { size: 17 }), 'Archive my Classroom']),
        el('button', { class: 'btn', onClick: handlers.onDemo }, [icon('eye', { size: 17 }), 'View live demo'])
      ])
    ]),
    dropzone,
    el('div', { class: 'divider-or' }, 'or load from a link'),
    urlRow(handlers),
    features,
    el('p', { class: 'small muted', style: { textAlign: 'center', marginTop: '32px' } },
      'Made for students, teachers, and schools. 100% local — your data never leaves your device unless you choose to share it.')
  ]);
}

function urlRow(handlers) {
  const input = el('input', {
    type: 'url',
    placeholder: 'https://…/my-archive.zip',
    style: {
      flex: '1', height: '42px', padding: '0 12px', fontSize: '15px',
      border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', color: 'var(--text)'
    },
    onKeydown: (e) => { if (e.key === 'Enter') go(); }
  });
  function go() {
    const url = input.value.trim();
    if (url) handlers.onUrl(url);
    else toast('Enter a URL to an archive file.', 'error');
  }
  return el('div', { style: { display: 'flex', gap: '10px', maxWidth: '620px', margin: '0 auto' } }, [
    input,
    el('button', { class: 'btn', onClick: go }, [icon('external', { size: 16 }), 'Load'])
  ]);
}

function feature(iconName, title, body) {
  return el('div', { class: 'feature card' }, [
    el('div', { class: 'f-icon' }, icon(iconName, { size: 20 })),
    el('h4', {}, title),
    el('p', {}, body)
  ]);
}
