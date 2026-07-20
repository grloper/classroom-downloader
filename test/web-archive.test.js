import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCourse,
  normalizeCourseWork,
  normalizeCourseWorkMaterial,
  normalizeAnnouncement,
  normalizeTopic
} from '../web/src/scraper/normalize.js';
import {
  buildGraph,
  makeArchive,
  normalizeArchive,
  countGraph,
  flattenAttachments,
  encodeSharePayload,
  decodeSharePayload,
  makeShareable
} from '../web/src/archive/format.js';
import { applyFilters, collectTypes, collectProviders, emptyFilters } from '../web/src/ui/filters.js';
import { bytesToSize, fileKind } from '../web/src/util/format.js';
import { encodeBase64Url, decodeBase64Url } from '../web/src/util/base64.js';
import { shortHash } from '../web/src/util/hash.js';

function sampleEntities() {
  const course = normalizeCourse({ id: 'c1', name: 'Math', alternateLink: 'x' }, [{ profile: { name: { fullName: 'Ada' } } }]);
  const topic = normalizeTopic('c1', { topicId: 't1', name: 'Algebra' }, 0);
  const work = normalizeCourseWork('c1', {
    id: 'w1',
    title: 'Homework 1',
    description: 'Do problems',
    topicId: 't1',
    dueDate: { year: 2026, month: 7, day: 1 },
    alternateLink: 'link',
    materials: [{ driveFile: { driveFile: { id: 'f1', title: 'sheet.pdf', mimeType: 'application/pdf' } } }]
  });
  const mat = normalizeCourseWorkMaterial('c1', {
    id: 'm1',
    title: 'Notes',
    topicId: 't1',
    materials: [{ link: { url: 'https://ex.com', title: 'Reference' } }]
  });
  const ann = normalizeAnnouncement('c1', { id: 'p1', text: 'Welcome to class\nsecond line' });
  const materials = [work, mat, ann];
  const attachments = materials.flatMap((m) => m.attachments);
  return { courses: [course], topics: [topic], materials, attachments };
}

test('normalizers produce the shared data model', () => {
  const { materials } = sampleEntities();
  const work = materials[0];
  assert.equal(work.type, 'assignment');
  assert.equal(work.due_date, '2026-07-01');
  assert.equal(work.attachments[0].provider, 'drive');
  assert.equal(work.attachments[0].file_id, 'f1');
  const ann = materials[2];
  assert.equal(ann.type, 'announcement');
  assert.equal(ann.title, 'Welcome to class'); // first line only
});

test('buildGraph nests courses → topics → materials → attachments', () => {
  const graph = buildGraph(sampleEntities());
  assert.equal(graph.courses.length, 1);
  const course = graph.courses[0];
  assert.equal(course.name, 'Math');
  assert.equal(course.teacher, 'Ada');
  const algebra = course.topics.find((t) => t.title === 'Algebra');
  assert.ok(algebra, 'topic present');
  assert.equal(algebra.materials.length, 2); // work + material (announcement has no topic)
  const uncategorized = course.topics.find((t) => t.title === 'Uncategorized');
  assert.ok(uncategorized, 'announcement fell into Uncategorized');
  assert.equal(uncategorized.materials[0].type, 'announcement');
});

test('countGraph and flattenAttachments', () => {
  const graph = buildGraph(sampleEntities());
  const counts = countGraph(graph);
  assert.equal(counts.courses, 1);
  assert.equal(counts.materials, 3);
  assert.equal(counts.attachments, 2);
  const rows = flattenAttachments(graph);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.course_name === 'Math'));
});

test('normalizeArchive accepts a bare master_index.json graph', () => {
  const graph = buildGraph(sampleEntities());
  const archive = normalizeArchive(graph); // bare graph, like the CLI export
  assert.equal(archive.format, 'classroom-archive');
  assert.equal(archive.meta.counts.courses, 1);
  assert.equal(archive.graph.courses[0].name, 'Math');
});

test('normalizeArchive accepts flat entities', () => {
  const archive = normalizeArchive(sampleEntities());
  assert.equal(archive.graph.courses[0].topics.length >= 1, true);
  assert.equal(archive.meta.counts.attachments, 2);
});

test('normalizeArchive rejects junk', () => {
  assert.throws(() => normalizeArchive(null));
  assert.throws(() => normalizeArchive({ hello: 'world' }));
});

test('share link round-trips and strips local files', () => {
  const graph = buildGraph(sampleEntities());
  // Simulate a downloaded file on one attachment.
  graph.courses[0].topics[0].materials[0].attachments[0].local_path = 'courses/Math/Algebra/HW/sheet.pdf';
  graph.courses[0].topics[0].materials[0].attachments[0].status = 'complete';
  const archive = makeArchive(graph);

  const shareable = makeShareable(archive);
  assert.equal(shareable.graph.courses[0].topics[0].materials[0].attachments[0].local_path, null);

  const encoded = encodeSharePayload(archive);
  const decoded = decodeSharePayload(encoded);
  assert.equal(decoded.graph.courses[0].name, 'Math');
  assert.equal(decoded.meta.shared, true);
  assert.equal(decoded.graph.courses[0].topics[0].materials[0].attachments[0].local_path, null);
});

test('filters: search query narrows results', () => {
  const graph = buildGraph(sampleEntities());
  const f = { ...emptyFilters(), query: 'homework' };
  const out = applyFilters(graph, f);
  const titles = out.courses.flatMap((c) => c.topics.flatMap((t) => t.materials.map((m) => m.title)));
  assert.deepEqual(titles, ['Homework 1']);
});

test('filters: by material type and provider', () => {
  const graph = buildGraph(sampleEntities());
  const byType = applyFilters(graph, { ...emptyFilters(), types: ['announcement'] });
  const types = byType.courses.flatMap((c) => c.topics.flatMap((t) => t.materials.map((m) => m.type)));
  assert.deepEqual(types, ['announcement']);

  const byProvider = applyFilters(graph, { ...emptyFilters(), providers: ['drive'] });
  const providers = byProvider.courses.flatMap((c) =>
    c.topics.flatMap((t) => t.materials.flatMap((m) => m.attachments.map((a) => a.provider)))
  );
  assert.ok(providers.length >= 1 && providers.every((p) => p === 'drive'));
});

test('collectTypes / collectProviders enumerate the graph', () => {
  const graph = buildGraph(sampleEntities());
  assert.deepEqual(collectTypes(graph).sort(), ['announcement', 'assignment', 'material']);
  assert.deepEqual(collectProviders(graph).sort(), ['drive', 'link']);
});

test('format helpers', () => {
  assert.equal(bytesToSize(0), '—');
  assert.equal(bytesToSize(1024), '1 KB');
  assert.equal(bytesToSize(1536), '1.5 KB');
  assert.equal(fileKind('application/pdf', 'x.pdf'), 'pdf');
  assert.equal(fileKind('', 'photo.PNG'), 'image');
  assert.equal(fileKind('video/mp4', 'clip.mp4'), 'video');
});

test('base64url round-trips unicode', () => {
  const s = 'Classroom — café ☕ ünïcode';
  assert.equal(decodeBase64Url(encodeBase64Url(s)), s);
});

test('shortHash is stable and 16 hex chars', () => {
  const a = shortHash('hello');
  const b = shortHash('hello');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(shortHash('hello'), shortHash('world'));
});
