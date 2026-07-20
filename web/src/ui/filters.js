/**
 * Pure filtering over an archive graph. Returns a new graph of the same shape
 * containing only matching items, so the viewer can render the result directly.
 * No DOM here — unit-testable in Node.
 */

export const DEFAULT_FILTERS = {
  query: '',
  courseId: null, // null = all courses
  types: [], // material types to include; empty = all
  providers: [], // attachment providers to include; empty = all
  downloadedOnly: false,
  withAttachmentsOnly: false
};

export function emptyFilters() {
  return { ...DEFAULT_FILTERS, types: [], providers: [] };
}

function matchesText(haystackParts, needle) {
  if (!needle) return true;
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystackParts.filter(Boolean).join('\n').toLowerCase().includes(q);
}

function attachmentPasses(att, filters) {
  if (filters.providers.length && !filters.providers.includes(att.provider)) return false;
  if (filters.downloadedOnly && !(att.status === 'complete' && att.local_path)) return false;
  return true;
}

function materialPasses(mat, filters) {
  if (filters.types.length && !filters.types.includes(mat.type)) return false;
  return true;
}

/** Apply filters and return { graph, counts }. */
export function applyFilters(graph, filters = DEFAULT_FILTERS) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const courses = [];

  for (const course of graph.courses || []) {
    if (f.courseId && course.id !== f.courseId) continue;

    const topics = [];
    for (const topic of course.topics || []) {
      const materials = [];
      for (const material of topic.materials || []) {
        if (!materialPasses(material, f)) continue;

        const attachments = (material.attachments || []).filter((a) => attachmentPasses(a, f));

        if (f.withAttachmentsOnly && attachments.length === 0) continue;

        const textHit = matchesText(
          [
            course.name,
            topic.title,
            material.title,
            material.description,
            ...attachments.map((a) => a.filename)
          ],
          f.query
        );
        // A material with a matching attachment but non-matching title still
        // passes if any of its (filtered) attachments matches the text.
        if (!textHit) continue;

        materials.push({ ...material, attachments });
      }
      if (materials.length) topics.push({ ...topic, materials });
    }
    if (topics.length || !f.query) {
      // Keep empty courses only when nothing is being searched/filtered so the
      // sidebar still lists them; hide them once a query narrows results.
      if (topics.length || (!f.query && f.types.length === 0 && f.providers.length === 0 && !f.downloadedOnly && !f.withAttachmentsOnly)) {
        courses.push({ ...course, topics });
      }
    }
  }

  return { generated_at: graph.generated_at, courses };
}

/** Distinct material types present in the graph, for filter chips. */
export function collectTypes(graph) {
  const set = new Set();
  for (const c of graph.courses || []) {
    for (const t of c.topics || []) {
      for (const m of t.materials || []) set.add(m.type || 'material');
    }
  }
  return [...set];
}

/** Distinct attachment providers present in the graph. */
export function collectProviders(graph) {
  const set = new Set();
  for (const c of graph.courses || []) {
    for (const t of c.topics || []) {
      for (const m of t.materials || []) {
        for (const a of m.attachments || []) set.add(a.provider || 'link');
      }
    }
  }
  return [...set];
}
