import { el, clear, icon } from '../util/dom.js';
import { fileKind, providerLabel, bytesToSize } from '../util/format.js';
import { triggerDownload } from '../archive/exporter.js';

/**
 * Open an attachment. Downloaded files (present in the loaded archive) preview
 * inline; reference-only attachments (links/youtube/forms, or files not in this
 * archive) open their source URL in a new tab.
 */
export function openAttachment(loaded, att) {
  const url = att.local_path ? loaded.resolve(att.local_path) : null;

  // No local file: fall back to the source link.
  if (!url) {
    const link = att.source_url || att.download_url;
    if (link) {
      window.open(link, '_blank', 'noopener');
    } else {
      openModal(att, el('div', { class: 'preview-fallback' }, [
        icon('info', { size: 32 }),
        el('p', {}, 'This attachment has no downloaded file or link to preview.')
      ]));
    }
    return;
  }

  const kind = fileKind(att.mime_type, att.filename);
  let body;
  if (kind === 'image') {
    body = el('img', { src: url, alt: att.filename });
  } else if (kind === 'video') {
    body = el('video', { src: url, controls: true });
  } else if (kind === 'audio') {
    body = el('audio', { src: url, controls: true, style: { width: '90%' } });
  } else if (kind === 'pdf' || kind === 'text') {
    body = el('iframe', { src: url, title: att.filename });
  } else {
    const blob = loaded.fileBlob(att.local_path);
    body = el('div', { class: 'preview-fallback' }, [
      icon('file', { size: 36 }),
      el('h3', { style: { margin: '10px 0 4px' } }, att.filename),
      el('p', { class: 'muted' }, `${providerLabel(att.provider)} · ${bytesToSize(att.bytes || (blob && blob.size))}`),
      el('button', {
        class: 'btn primary', style: { marginTop: '12px' },
        onClick: () => blob && triggerDownload(blob, att.filename)
      }, [icon('download', { size: 16 }), 'Download file'])
    ]);
  }
  openModal(att, body, loaded);
}

function openModal(att, body, loaded) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  });

  const actions = [];
  const blob = loaded && att.local_path ? loaded.fileBlob(att.local_path) : null;
  if (blob) {
    actions.push(el('button', {
      class: 'btn sm', onClick: () => triggerDownload(blob, att.filename)
    }, [icon('download', { size: 15 }), 'Download']));
  }
  if (att.source_url) {
    actions.push(el('a', {
      class: 'btn sm', href: att.source_url, target: '_blank', rel: 'noopener'
    }, [icon('external', { size: 15 }), 'Source']));
  }
  actions.push(el('button', { class: 'icon-btn', onClick: close, title: 'Close' }, icon('x', { size: 18 })));

  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      icon(fileKind(att.mime_type, att.filename) === 'image' ? 'image' : 'file', { size: 18 }),
      el('div', { class: 'm-title' }, att.filename),
      ...actions
    ]),
    el('div', { class: 'modal-body' }, body)
  ]);
  clear(overlay).appendChild(modal);
  document.body.appendChild(overlay);
}
