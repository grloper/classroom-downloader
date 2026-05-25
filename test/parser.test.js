import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAttachments,
  formatDueDate,
  mapCourseWorkType,
  normalizeCourseWork
} from '../src/parsers/classroom.js';

test('formatDueDate handles date-only and date-time values', () => {
  assert.equal(formatDueDate({ year: 2026, month: 5, day: 9 }), '2026-05-09');
  assert.equal(
    formatDueDate({ year: 2026, month: 5, day: 9 }, { hours: 8, minutes: 3, seconds: 4 }),
    '2026-05-09T08:03:04'
  );
  assert.equal(formatDueDate(null), null);
});

test('mapCourseWorkType normalizes Classroom work kinds', () => {
  assert.equal(mapCourseWorkType({ workType: 'ASSIGNMENT' }), 'assignment');
  assert.equal(mapCourseWorkType({ workType: 'SHORT_ANSWER_QUESTION' }), 'question');
  assert.equal(mapCourseWorkType({ workType: 'ASSIGNMENT', quizSettings: {} }), 'quiz');
});

test('extractAttachments normalizes supported material attachment types', () => {
  const attachments = extractAttachments(
    [
      { driveFile: { driveFile: { id: 'drive-1', title: 'Worksheet' } } },
      { link: { url: 'https://example.com/a', title: 'External' } },
      { youtubeVideo: { id: 'abc123', title: 'Lecture' } },
      { form: { formUrl: 'https://docs.google.com/forms/d/form-1', title: 'Quiz Form' } }
    ],
    'course:material:1'
  );

  assert.deepEqual(
    attachments.map((item) => item.provider),
    ['drive', 'link', 'youtube', 'form']
  );
  assert.equal(attachments[0].file_id, 'drive-1');
});

test('normalizeCourseWork carries attachments and due date', () => {
  const material = normalizeCourseWork('course-1', {
    id: 'work-1',
    title: 'Homework',
    description: 'Do it',
    workType: 'ASSIGNMENT',
    dueDate: { year: 2026, month: 6, day: 1 },
    materials: [{ link: { url: 'https://example.com/homework' } }]
  });

  assert.equal(material.id, 'course-1:courseWork:work-1');
  assert.equal(material.type, 'assignment');
  assert.equal(material.due_date, '2026-06-01');
  assert.equal(material.attachments.length, 1);
});
