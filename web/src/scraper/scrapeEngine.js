/**
 * Orchestrates a full in-browser scrape:
 *   1. discover courses (optionally filtered to one Classroom URL),
 *   2. crawl topics / coursework / materials / announcements,
 *   3. normalize into the shared data model,
 *   4. optionally download Drive files as Blobs.
 *
 * Returns { entities, files } where `entities` is the flat model consumed by
 * archive/format.buildGraph and `files` is a Map(path → { blob, mimeType }).
 * All progress is surfaced via onProgress so the UI stays responsive.
 */
import {
  listCourses,
  listTeachers,
  listTopics,
  listCourseWork,
  listCourseWorkMaterials,
  listAnnouncements,
  safeList
} from './classroomApi.js';
import { downloadDriveAttachment } from './driveApi.js';
import {
  normalizeCourse,
  normalizeTopic,
  normalizeCourseWork,
  normalizeCourseWorkMaterial,
  normalizeAnnouncement
} from './normalize.js';
import { safeSegment, joinPath, uniquePath } from '../util/paths.js';
import { config as defaultConfig } from '../../config.js';

const noop = () => {};

export async function scrapeClassroom({
  session,
  config = defaultConfig,
  courseFilterIds = null,
  includeDrive = true,
  onProgress = noop,
  signal
} = {}) {
  const warn = (message) => onProgress({ phase: 'warn', message });
  onProgress({ phase: 'discover', message: 'Finding your courses…' });

  let courses = await listCourses(session, config.courseStates, { signal });
  if (courseFilterIds && courseFilterIds.length > 0) {
    const filterSet = new Set(courseFilterIds);
    const filtered = courses.filter((c) => filterSet.has(c.id));
    if (filtered.length) courses = filtered;
    else warn(`Selected courses not found in your account — archiving all courses instead.`);
  }

  const entities = { courses: [], topics: [], materials: [], attachments: [] };

  for (let i = 0; i < courses.length; i += 1) {
    const course = courses[i];
    onProgress({
      phase: 'crawl',
      message: `Reading “${course.name || course.id}”`,
      current: i + 1,
      total: courses.length
    });

    const teachers = await safeList(`teachers for ${course.id}`, () => listTeachers(session, course.id, { signal }), warn);
    entities.courses.push(normalizeCourse(course, teachers));

    const topics = await safeList(`topics for ${course.id}`, () => listTopics(session, course.id, { signal }), warn);
    topics.forEach((topic, idx) => entities.topics.push(normalizeTopic(course.id, topic, idx)));

    const courseWork = await safeList(`coursework for ${course.id}`, () => listCourseWork(session, course.id, { signal }), warn);
    const courseWorkMaterials = await safeList(
      `materials for ${course.id}`,
      () => listCourseWorkMaterials(session, course.id, { signal }),
      warn
    );
    const announcements = await safeList(
      `announcements for ${course.id}`,
      () => listAnnouncements(session, course.id, { signal }),
      warn
    );

    const materials = [
      ...courseWork.map((item) => normalizeCourseWork(course.id, item)),
      ...courseWorkMaterials.map((item) => normalizeCourseWorkMaterial(course.id, item)),
      ...announcements.map((item) => normalizeAnnouncement(course.id, item))
    ];
    entities.materials.push(...materials);
    for (const material of materials) entities.attachments.push(...material.attachments);
  }

  onProgress({
    phase: 'crawled',
    message: `Found ${entities.courses.length} courses, ${entities.materials.length} items, ${entities.attachments.length} attachments.`
  });

  const files = new Map();
  if (includeDrive) {
    await downloadDriveFiles({ session, entities, files, onProgress, signal });
    await downloadNonDriveAttachments({ entities, files, onProgress, signal });
  }

  return { entities, files };
}

/** Build the in-archive relative path for an attachment's material. */
function materialDir(entities, attachment) {
  const material = entities.materials.find((m) => m.id === attachment.material_id);
  const course = material && entities.courses.find((c) => c.id === material.course_id);
  const topic = material && material.topic_id && entities.topics.find((t) => t.id === material.topic_id);
  return joinPath(
    'courses',
    safeSegment(course?.name || course?.id || 'course'),
    safeSegment(topic?.title || 'Uncategorized'),
    safeSegment(material?.title || material?.id || 'material')
  );
}

async function downloadDriveFiles({ session, entities, files, onProgress, signal }) {
  const driveAttachments = entities.attachments.filter((a) => a.provider === 'drive' && a.file_id);
  const total = driveAttachments.length;
  if (!total) return;

  const usedPaths = new Set();
  let done = 0;
  let failed = 0;
  const concurrency = 4;

  onProgress({ phase: 'download', message: `Downloading ${total} Drive files…`, current: 0, total });

  const queue = [...driveAttachments];
  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const attachment = queue.shift();
      try {
        const result = await downloadDriveAttachment(session, attachment, { signal });
        const dir = materialDir(entities, attachment);
        const relPath = uniquePath(joinPath(dir, safeSegment(result.filename)), usedPaths);
        files.set(relPath, { blob: result.blob, mimeType: result.mimeType });
        Object.assign(attachment, {
          filename: result.filename,
          mime_type: result.mimeType,
          local_path: relPath,
          bytes: result.bytes,
          status: 'complete',
          downloaded_files: [
            { label: 'primary', filename: result.filename, mime_type: result.mimeType, local_path: relPath, bytes: result.bytes }
          ]
        });
      } catch (err) {
        failed += 1;
        Object.assign(attachment, { status: 'failed', skipped_reason: err.message });
        onProgress({ phase: 'warn', message: `Could not download ${attachment.filename}: ${err.message}` });
      } finally {
        done += 1;
        onProgress({ phase: 'download', message: `Downloaded ${done}/${total} files`, current: done, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  onProgress({
    phase: 'downloaded',
    message: `Downloaded ${total - failed}/${total} files${failed ? ` (${failed} unavailable)` : ''}.`,
    current: total,
    total
  });
}

async function downloadNonDriveAttachments({ entities, files, onProgress, signal }) {
  const attachments = entities.attachments.filter((a) => a.provider !== 'drive');
  const total = attachments.length;
  if (!total) return;

  const usedPaths = new Set();
  let done = 0;
  let failed = 0;
  const concurrency = 4;

  onProgress({ phase: 'download', message: `Downloading ${total} non-Drive attachments…`, current: 0, total });

  const queue = [...attachments];
  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const attachment = queue.shift();
      try {
        let blob, mimeType, ext;
        
        const targetUrl = attachment.source_url || attachment.download_url || attachment.url || '';

        if (attachment.provider === 'link') {
          try {
            const res = await fetch(targetUrl, { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blob = await res.blob();
            mimeType = blob.type.split(';')[0];
            ext = guessExtFromMime(mimeType) || 'html';
          } catch (err) {
            // Fall back to .url shortcut
            const shortcut = saveUrlShortcut(targetUrl);
            blob = shortcut.blob;
            mimeType = shortcut.mimeType;
            ext = 'url';
          }
        } else if (attachment.provider === 'youtube' || attachment.provider === 'form') {
          const shortcut = saveUrlShortcut(targetUrl);
          blob = shortcut.blob;
          mimeType = shortcut.mimeType;
          ext = 'url';
        } else {
          // Fallback for unknown provider
          const shortcut = saveUrlShortcut(targetUrl);
          blob = shortcut.blob;
          mimeType = shortcut.mimeType;
          ext = 'url';
        }

        const baseName = safeSegment(attachment.filename || attachment.title || attachment.id || attachment.provider);
        const filename = `${baseName}.${ext}`;
        const dir = materialDir(entities, attachment);
        const relPath = uniquePath(joinPath(dir, filename), usedPaths);
        
        files.set(relPath, { blob, mimeType });
        Object.assign(attachment, {
          filename,
          mime_type: mimeType,
          local_path: relPath,
          bytes: blob.size,
          status: 'complete',
          downloaded_files: [
            { label: 'primary', filename, mime_type: mimeType, local_path: relPath, bytes: blob.size }
          ]
        });
      } catch (err) {
        failed += 1;
        Object.assign(attachment, { status: 'failed', skipped_reason: err.message });
        onProgress({ phase: 'warn', message: `Could not process ${attachment.filename || attachment.title || targetUrl}: ${err.message}` });
      } finally {
        done += 1;
        onProgress({ phase: 'download', message: `Downloaded ${done}/${total} non-Drive items`, current: done, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  onProgress({
    phase: 'downloaded',
    message: `Downloaded ${total - failed}/${total} non-Drive items${failed ? ` (${failed} unavailable)` : ''}.`,
    current: total,
    total
  });
}

function saveUrlShortcut(url) {
  return {
    blob: new Blob([`[InternetShortcut]\nURL=${url}\n`], { type: 'text/plain' }),
    mimeType: 'text/plain'
  };
}

function guessExtFromMime(mime) {
  const m = mime.toLowerCase();
  if (m.includes('html')) return 'html';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  if (m.includes('json')) return 'json';
  if (m.includes('text/plain')) return 'txt';
  return null;
}
