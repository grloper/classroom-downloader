import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { ArchiveDatabase } from '../src/storage/database.js';
import { exportArchive } from '../src/storage/exporter.js';

test('database rows export into the nested course JSON schema', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classroom-archive-'));
  const activeConfig = {
    paths: {
      outputRoot: path.join(tempDir, 'output'),
      coursesRoot: path.join(tempDir, 'output', 'courses'),
      dbPath: path.join(tempDir, 'database', 'classroom.db')
    }
  };

  const db = new ArchiveDatabase(activeConfig.paths.dbPath);
  try {
    db.upsertCourse({
      id: 'course-1',
      name: 'Math Class',
      url: 'https://classroom.google.com/c/course-1',
      teacher: 'Ada',
      created_at: '2026-01-01T00:00:00Z',
      section: '',
      description: '',
      room: '',
      raw: {}
    });
    db.upsertTopic({
      id: 'topic-1',
      course_id: 'course-1',
      title: 'Algebra',
      position: 0,
      raw: {}
    });
    db.upsertMaterial({
      id: 'material-1',
      course_id: 'course-1',
      topic_id: 'topic-1',
      title: 'Worksheet',
      description: 'Solve the set',
      type: 'assignment',
      due_date: '2026-02-01',
      local_path: null,
      source_url: 'https://example.com/material',
      raw: {}
    });
    db.upsertAttachment({
      id: 'attachment-1',
      material_id: 'material-1',
      filename: 'worksheet.pdf',
      mime_type: 'application/pdf',
      local_path: 'courses/Math Class/Algebra/Worksheet/worksheet.pdf',
      download_url: null,
      source_url: 'https://drive.google.com/file/d/1',
      provider: 'drive',
      file_id: 'file-1',
      raw: {}
    });

    const { graph } = await exportArchive(db, activeConfig);
    assert.equal(graph.courses.length, 1);
    assert.equal(graph.courses[0].topics[0].materials[0].attachments[0].filename, 'worksheet.pdf');

    const master = await fs.readJson(path.join(activeConfig.paths.outputRoot, 'master_index.json'));
    assert.equal(master.courses[0].name, 'Math Class');
  } finally {
    db.close();
    await fs.remove(tempDir);
  }
});
