/**
 * The portable archive format shared by the scraper, the serializer and the
 * viewer. Pure and Node-importable so it can be unit-tested.
 *
 * Envelope:
 *   {
 *     format: 'classroom-archive',
 *     version: 1,
 *     meta:  { app, appVersion, generatedAt, source, account, counts },
 *     graph: { generated_at, courses: [ { …, topics: [ { …, materials: [ { …, attachments } ] } ] } ] }
 *   }
 *
 * `graph` is deliberately identical to the Node engine's `output/master_index.json`
 * (see src/storage/database.js#getCoursesGraph), so files from either tool load
 * in the same viewer with no conversion.
 */
import { encodeBase64Url, decodeBase64Url } from '../util/base64.js';

export const ARCHIVE_FORMAT = 'classroom-archive';
export const ARCHIVE_VERSION = 1;

/** Build the nested courses graph from flat normalized entities. */
export function buildGraph({ courses = [], topics = [], materials = [], attachments = [] }, generatedAt) {
  const attachmentsByMaterial = new Map();
  for (const a of attachments) {
    const list = attachmentsByMaterial.get(a.material_id) || [];
    list.push({
      id: a.id,
      filename: a.filename,
      local_path: a.local_path ?? null,
      mime_type: a.mime_type,
      provider: a.provider,
      file_id: a.file_id ?? null,
      source_url: a.source_url ?? null,
      download_url: a.download_url ?? null,
      status: a.status ?? 'pending',
      bytes: a.bytes ?? null,
      skipped_reason: a.skipped_reason ?? null,
      downloaded_files: a.downloaded_files ?? (a.raw && a.raw.downloaded_files) ?? []
    });
    attachmentsByMaterial.set(a.material_id, list);
  }

  const materialsByTopic = new Map();
  for (const m of materials) {
    const topicKey = m.topic_id || `${m.course_id}:uncategorized`;
    const list = materialsByTopic.get(topicKey) || [];
    list.push({
      id: m.id,
      title: m.title,
      description: m.description || '',
      type: m.type,
      due_date: m.due_date ?? null,
      source_url: m.source_url ?? null,
      local_path: m.local_path ?? null,
      attachments: attachmentsByMaterial.get(m.id) || []
    });
    materialsByTopic.set(topicKey, list);
  }

  const topicsByCourse = new Map();
  for (const t of [...topics].sort((x, y) => (x.position || 0) - (y.position || 0))) {
    const list = topicsByCourse.get(t.course_id) || [];
    list.push({ id: t.id, title: t.title, materials: materialsByTopic.get(t.id) || [] });
    topicsByCourse.set(t.course_id, list);
  }

  // Attach an "Uncategorized" bucket for materials with no topic.
  for (const [topicKey, mats] of materialsByTopic.entries()) {
    if (!topicKey.endsWith(':uncategorized')) continue;
    const courseId = topicKey.replace(/:uncategorized$/, '');
    const list = topicsByCourse.get(courseId) || [];
    list.push({ id: topicKey, title: 'Uncategorized', materials: mats });
    topicsByCourse.set(courseId, list);
  }

  return {
    generated_at: generatedAt || new Date().toISOString(),
    courses: [...courses]
      .sort((x, y) => String(x.name).localeCompare(String(y.name)))
      .map((c) => ({
        id: c.id,
        name: c.name,
        teacher: c.teacher || '',
        url: c.url || '',
        created_at: c.created_at ?? null,
        section: c.section || '',
        description: c.description || '',
        room: c.room || '',
        topics: topicsByCourse.get(c.id) || []
      }))
  };
}

/** Wrap a graph in a versioned archive envelope. */
export function makeArchive(graph, meta = {}) {
  const counts = countGraph(graph);
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    meta: {
      app: meta.app || 'Classroom Archiver',
      appVersion: meta.appVersion || '',
      generatedAt: meta.generatedAt || graph.generated_at || new Date().toISOString(),
      source: meta.source || 'unknown',
      account: meta.account || null,
      title: meta.title || defaultTitle(graph),
      counts
    },
    graph
  };
}

function defaultTitle(graph) {
  const n = graph?.courses?.length || 0;
  if (n === 0) return 'Empty archive';
  if (n === 1) return graph.courses[0].name;
  return `${n} courses`;
}

/**
 * Accept anything that plausibly represents an archive and return a canonical
 * envelope. Handles: full envelopes, a bare graph (Node master_index.json),
 * or flat `{courses,topics,materials,attachments}` entities.
 */
export function normalizeArchive(input, meta = {}) {
  if (!input || typeof input !== 'object') throw new Error('Not a valid archive file.');

  if (input.format === ARCHIVE_FORMAT && input.graph) {
    return { ...input, graph: sanitizeGraph(input.graph), meta: { ...input.meta, counts: countGraph(input.graph) } };
  }
  if (Array.isArray(input.courses) && input.courses.some((c) => Array.isArray(c.topics))) {
    // A bare graph (already nested) — e.g. the Node engine's master_index.json.
    const graph = sanitizeGraph(input);
    return makeArchive(graph, { source: meta.source || 'master_index.json', ...meta });
  }
  if (Array.isArray(input.courses)) {
    // Flat entities from a scrape.
    const graph = buildGraph(input, input.generated_at);
    return makeArchive(graph, meta);
  }
  throw new Error('Unrecognized archive shape. Expected a Classroom Archiver export or master_index.json.');
}

/** Defensive: guarantee the nested arrays exist so the viewer never crashes. */
export function sanitizeGraph(graph) {
  return {
    generated_at: graph.generated_at || new Date().toISOString(),
    courses: (graph.courses || []).map((c) => ({
      id: c.id,
      name: c.name || c.id || 'Untitled course',
      teacher: c.teacher || '',
      url: c.url || '',
      created_at: c.created_at ?? null,
      section: c.section || '',
      description: c.description || '',
      room: c.room || '',
      topics: (c.topics || []).map((t) => ({
        id: t.id,
        title: t.title || 'Untitled topic',
        materials: (t.materials || []).map((m) => ({
          id: m.id,
          title: m.title || 'Untitled',
          description: m.description || '',
          type: m.type || 'material',
          due_date: m.due_date ?? null,
          source_url: m.source_url ?? null,
          local_path: m.local_path ?? null,
          attachments: (m.attachments || []).map((a) => ({
            id: a.id,
            filename: a.filename || 'attachment',
            local_path: a.local_path ?? null,
            mime_type: a.mime_type || '',
            provider: a.provider || 'link',
            file_id: a.file_id ?? null,
            source_url: a.source_url ?? null,
            download_url: a.download_url ?? null,
            status: a.status ?? 'pending',
            bytes: a.bytes ?? null,
            skipped_reason: a.skipped_reason ?? null,
            downloaded_files: a.downloaded_files || []
          }))
        }))
      }))
    }))
  };
}

export function countGraph(graph) {
  let topics = 0;
  let materials = 0;
  let attachments = 0;
  let files = 0;
  let bytes = 0;
  for (const c of graph.courses || []) {
    for (const t of c.topics || []) {
      topics += 1;
      for (const m of t.materials || []) {
        materials += 1;
        for (const a of m.attachments || []) {
          attachments += 1;
          if (a.local_path) files += 1;
          bytes += Number(a.bytes) || 0;
        }
      }
    }
  }
  return { courses: (graph.courses || []).length, topics, materials, attachments, files, bytes };
}

/** Flatten every attachment with its course/topic/material context (for search & lists). */
export function flattenAttachments(graph) {
  const rows = [];
  for (const c of graph.courses || []) {
    for (const t of c.topics || []) {
      for (const m of t.materials || []) {
        for (const a of m.attachments || []) {
          rows.push({
            ...a,
            course_id: c.id,
            course_name: c.name,
            topic_id: t.id,
            topic_title: t.title,
            material_id: m.id,
            material_title: m.title,
            material_type: m.type
          });
        }
      }
    }
  }
  return rows;
}

// ---- Share-link codec (small metadata-only archives embedded in a URL) ----

export function encodeSharePayload(archive) {
  const slim = makeShareable(archive);
  return encodeBase64Url(JSON.stringify(slim));
}

export function decodeSharePayload(encoded) {
  const obj = JSON.parse(decodeBase64Url(encoded));
  return normalizeArchive(obj, { source: 'share-link' });
}

/**
 * Strip binary/local references for an inline share link — receivers cannot
 * read another person's local files, so we drop `local_path` and keep only
 * links/metadata. Keeps the link small and avoids dangling file references.
 */
export function makeShareable(archive) {
  const graph = sanitizeGraph(archive.graph);
  for (const c of graph.courses) {
    for (const t of c.topics) {
      for (const m of t.materials) {
        m.local_path = null;
        for (const a of m.attachments) {
          a.local_path = null;
          a.status = a.status === 'complete' ? 'reference' : a.status;
          a.downloaded_files = [];
        }
      }
    }
  }
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    meta: { ...archive.meta, shared: true },
    graph
  };
}
