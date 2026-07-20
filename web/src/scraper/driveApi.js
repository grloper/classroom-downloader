/**
 * Google Drive REST client (browser). Fetches file metadata and downloads the
 * bytes as Blobs, exporting Google Workspace files (Docs/Slides/Sheets/Drawings)
 * to portable formats — the same target formats as the Node engine, but the
 * first/most-viewable format only, to keep in-browser archives lean.
 */
import { googleFetch } from './googleFetch.js';
import { extname, stripExt } from '../util/paths.js';

const DRIVE = 'https://www.googleapis.com/drive/v3';

// First entry is the "primary" export used in the browser (most viewable).
export const EXPORT_TARGETS = {
  'application/vnd.google-apps.document': [
    { label: 'pdf', extension: '.pdf', mimeType: 'application/pdf' }
  ],
  'application/vnd.google-apps.presentation': [
    { label: 'pdf', extension: '.pdf', mimeType: 'application/pdf' }
  ],
  'application/vnd.google-apps.spreadsheet': [
    { label: 'xlsx', extension: '.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  ],
  'application/vnd.google-apps.drawing': [
    { label: 'png', extension: '.png', mimeType: 'image/png' }
  ],
  'application/vnd.google-apps.jam': [
    { label: 'pdf', extension: '.pdf', mimeType: 'application/pdf' }
  ]
};

export function isWorkspaceFile(mimeType) {
  return typeof mimeType === 'string' && mimeType.startsWith('application/vnd.google-apps.');
}

export async function getFileMetadata(session, fileId, { signal } = {}) {
  const url = new URL(`${DRIVE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,name,mimeType,size,md5Checksum,modifiedTime,webViewLink,webContentLink');
  return googleFetch(session, url.toString(), { signal });
}

async function exportWorkspaceFile(session, fileId, mimeType, signal) {
  const url = new URL(`${DRIVE}/files/${encodeURIComponent(fileId)}/export`);
  url.searchParams.set('mimeType', mimeType);
  return googleFetch(session, url.toString(), { responseType: 'blob', signal });
}

async function downloadBinaryFile(session, fileId, signal) {
  const url = new URL(`${DRIVE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  return googleFetch(session, url.toString(), { responseType: 'blob', signal });
}

/**
 * Download a Drive attachment. Returns:
 *   { filename, mimeType, bytes, blob, metadata }
 * where `blob` is the primary file bytes ready to be added to the export zip.
 */
export async function downloadDriveAttachment(session, attachment, { signal } = {}) {
  if (!attachment.file_id) throw new Error(`Attachment ${attachment.id} has no Drive file id`);
  const metadata = await getFileMetadata(session, attachment.file_id, { signal });
  const base = stripExt(metadata.name || attachment.filename || attachment.file_id);

  if (isWorkspaceFile(metadata.mimeType)) {
    const target = (EXPORT_TARGETS[metadata.mimeType] || [
      { label: 'pdf', extension: '.pdf', mimeType: 'application/pdf' }
    ])[0];
    const blob = await exportWorkspaceFile(session, attachment.file_id, target.mimeType, signal);
    return {
      filename: `${base}${target.extension}`,
      mimeType: target.mimeType,
      bytes: blob.size,
      blob,
      metadata
    };
  }

  const blob = await downloadBinaryFile(session, attachment.file_id, signal);
  const ext = extname(metadata.name || '') || '';
  return {
    filename: `${base}${ext}`,
    mimeType: metadata.mimeType || blob.type || 'application/octet-stream',
    bytes: blob.size,
    blob,
    metadata
  };
}
