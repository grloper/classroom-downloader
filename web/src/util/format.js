/** Human-friendly formatting helpers. Pure — safe to import anywhere. */

export function bytesToSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, i);
  const rounded = value >= 100 || i === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

export function formatDate(value) {
  if (!value) return '';
  // Accept `YYYY-MM-DD`, ISO timestamps, or Date-parseable strings.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  const hasTime = /T\d{2}:\d{2}/.test(String(value));
  const opts = hasTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleString(undefined, opts);
}

/** Relative descriptor for a due date, e.g. "in 3 days" / "2 days ago". */
export function dueLabel(value, now = new Date()) {
  if (!value) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (diffDays === 0) return 'due today';
  if (diffDays === 1) return 'due tomorrow';
  if (diffDays === -1) return 'due yesterday';
  if (diffDays > 0) return `due in ${diffDays} days`;
  return `due ${Math.abs(diffDays)} days ago`;
}

const PROVIDER_LABELS = {
  drive: 'Drive file',
  link: 'Link',
  youtube: 'YouTube',
  form: 'Google Form'
};

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || 'Attachment';
}

const TYPE_LABELS = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  question: 'Question',
  material: 'Material',
  announcement: 'Announcement'
};

export function materialTypeLabel(type) {
  return TYPE_LABELS[type] || 'Item';
}

/** Kind of a downloaded/known file, used to pick a preview strategy + icon. */
export function fileKind(mimeType = '', filename = '') {
  const mime = String(mimeType).toLowerCase();
  const name = String(filename).toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'ogv', 'mov'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'html'].includes(ext)) return 'text';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['ppt', 'pptx'].includes(ext)) return 'slides';
  if (['xls', 'xlsx'].includes(ext)) return 'sheet';
  return 'file';
}
