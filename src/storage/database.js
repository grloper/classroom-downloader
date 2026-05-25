import path from 'node:path';
import Database from 'better-sqlite3';
import fs from 'fs-extra';
import { config } from '../config.js';

function stringify(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class ArchiveDatabase {
  constructor(dbPath = config.paths.dbPath) {
    fs.ensureDirSync(path.dirname(dbPath));
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        name TEXT,
        url TEXT,
        teacher TEXT,
        created_at TEXT,
        section TEXT,
        description TEXT,
        room TEXT,
        raw_json TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        course_id TEXT,
        title TEXT,
        position INTEGER DEFAULT 0,
        raw_json TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        course_id TEXT,
        topic_id TEXT,
        title TEXT,
        description TEXT,
        type TEXT,
        due_date TEXT,
        local_path TEXT,
        source_url TEXT,
        raw_json TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        material_id TEXT,
        filename TEXT,
        mime_type TEXT,
        local_path TEXT,
        download_url TEXT,
        source_url TEXT,
        provider TEXT,
        file_id TEXT,
        status TEXT DEFAULT 'pending',
        error TEXT,
        bytes INTEGER,
        checksum TEXT,
        raw_json TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS crawl_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_topics_course ON topics(course_id);
      CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
      CREATE INDEX IF NOT EXISTS idx_materials_topic ON materials(topic_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_material ON attachments(material_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_file_id ON attachments(file_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(status);
    `);
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  upsertCourse(course) {
    this.db
      .prepare(
        `
        INSERT INTO courses (id, name, url, teacher, created_at, section, description, room, raw_json, updated_at)
        VALUES (@id, @name, @url, @teacher, @created_at, @section, @description, @room, @raw_json, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          url = excluded.url,
          teacher = excluded.teacher,
          created_at = excluded.created_at,
          section = excluded.section,
          description = excluded.description,
          room = excluded.room,
          raw_json = excluded.raw_json,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run({
        ...course,
        raw_json: stringify(course.raw)
      });
  }

  upsertTopic(topic) {
    this.db
      .prepare(
        `
        INSERT INTO topics (id, course_id, title, position, raw_json, updated_at)
        VALUES (@id, @course_id, @title, @position, @raw_json, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          course_id = excluded.course_id,
          title = excluded.title,
          position = excluded.position,
          raw_json = excluded.raw_json,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run({
        ...topic,
        raw_json: stringify(topic.raw)
      });
  }

  upsertMaterial(material) {
    this.db
      .prepare(
        `
        INSERT INTO materials (
          id, course_id, topic_id, title, description, type, due_date, local_path, source_url, raw_json, updated_at
        )
        VALUES (
          @id, @course_id, @topic_id, @title, @description, @type, @due_date, @local_path, @source_url, @raw_json, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO UPDATE SET
          course_id = excluded.course_id,
          topic_id = excluded.topic_id,
          title = excluded.title,
          description = excluded.description,
          type = excluded.type,
          due_date = excluded.due_date,
          source_url = excluded.source_url,
          raw_json = excluded.raw_json,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run({
        ...material,
        raw_json: stringify(material.raw)
      });
  }

  upsertAttachment(attachment) {
    const existing = this.db.prepare('SELECT raw_json FROM attachments WHERE id = ?').get(attachment.id);
    const mergedRaw = {
      ...parseJson(existing?.raw_json, {}),
      ...(attachment.raw || {})
    };

    this.db
      .prepare(
        `
        INSERT INTO attachments (
          id, material_id, filename, mime_type, local_path, download_url, source_url, provider, file_id, raw_json, updated_at
        )
        VALUES (
          @id, @material_id, @filename, @mime_type, @local_path, @download_url, @source_url, @provider, @file_id, @raw_json, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO UPDATE SET
          material_id = excluded.material_id,
          filename = excluded.filename,
          mime_type = COALESCE(NULLIF(excluded.mime_type, ''), attachments.mime_type),
          download_url = excluded.download_url,
          source_url = excluded.source_url,
          provider = excluded.provider,
          file_id = excluded.file_id,
          raw_json = excluded.raw_json,
          updated_at = CURRENT_TIMESTAMP
      `
      )
      .run({
        ...attachment,
        raw_json: stringify(mergedRaw)
      });
  }

  updateMaterialPath(materialId, localPath) {
    this.db
      .prepare('UPDATE materials SET local_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(localPath, materialId);
  }

  updateAttachmentDownload(attachmentId, fields) {
    const current = this.db.prepare('SELECT raw_json FROM attachments WHERE id = ?').get(attachmentId);
    const raw = parseJson(current?.raw_json, {});
    const mergedRaw = { ...raw, ...(fields.raw || {}) };

    this.db
      .prepare(
        `
        UPDATE attachments SET
          filename = COALESCE(@filename, filename),
          mime_type = COALESCE(@mime_type, mime_type),
          local_path = COALESCE(@local_path, local_path),
          status = COALESCE(@status, status),
          error = @error,
          bytes = COALESCE(@bytes, bytes),
          checksum = COALESCE(@checksum, checksum),
          raw_json = @raw_json,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `
      )
      .run({
        id: attachmentId,
        filename: fields.filename ?? null,
        mime_type: fields.mime_type ?? null,
        local_path: fields.local_path ?? null,
        status: fields.status ?? null,
        error: fields.error ?? null,
        bytes: fields.bytes ?? null,
        checksum: fields.checksum ?? null,
        raw_json: stringify(mergedRaw)
      });
  }

  findCompletedAttachmentByFileId(fileId) {
    if (!fileId) return null;
    return this.db
      .prepare(
        `
        SELECT * FROM attachments
        WHERE file_id = ?
          AND status = 'complete'
          AND local_path IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `
      )
      .get(fileId);
  }

  listAttachmentsForDownload() {
    return this.db
      .prepare(
        `
        SELECT
          a.*,
          m.title AS material_title,
          m.type AS material_type,
          m.course_id,
          m.topic_id,
          c.name AS course_name,
          t.title AS topic_title
        FROM attachments a
        JOIN materials m ON m.id = a.material_id
        JOIN courses c ON c.id = m.course_id
        LEFT JOIN topics t ON t.id = m.topic_id
        WHERE COALESCE(a.status, 'pending') != 'complete'
           OR a.local_path IS NULL
        ORDER BY c.name, t.position, m.title, a.filename
      `
      )
      .all();
  }

  getCounts() {
    const tables = ['courses', 'topics', 'materials', 'attachments'];
    return Object.fromEntries(
      tables.map((table) => [table, this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count])
    );
  }

  getCoursesGraph() {
    const courses = this.db.prepare('SELECT * FROM courses ORDER BY name').all();
    const topics = this.db.prepare('SELECT * FROM topics ORDER BY position, title').all();
    const materials = this.db.prepare('SELECT * FROM materials ORDER BY title').all();
    const attachments = this.db.prepare('SELECT * FROM attachments ORDER BY filename').all();

    const topicsByCourse = new Map();
    const materialsByTopic = new Map();
    const attachmentsByMaterial = new Map();

    for (const attachment of attachments) {
      const raw = parseJson(attachment.raw_json, {});
      const normalized = {
        id: attachment.id,
        filename: attachment.filename,
        local_path: attachment.local_path,
        mime_type: attachment.mime_type,
        provider: attachment.provider,
        file_id: attachment.file_id,
        source_url: attachment.source_url,
        download_url: attachment.download_url,
        status: attachment.status,
        downloaded_files: raw.downloaded_files || []
      };
      if (!attachmentsByMaterial.has(attachment.material_id)) attachmentsByMaterial.set(attachment.material_id, []);
      attachmentsByMaterial.get(attachment.material_id).push(normalized);
    }

    for (const material of materials) {
      const topicKey = material.topic_id || `${material.course_id}:uncategorized`;
      if (!materialsByTopic.has(topicKey)) materialsByTopic.set(topicKey, []);
      materialsByTopic.get(topicKey).push({
        id: material.id,
        title: material.title,
        description: material.description,
        type: material.type,
        due_date: material.due_date,
        source_url: material.source_url,
        local_path: material.local_path,
        attachments: attachmentsByMaterial.get(material.id) || []
      });
    }

    for (const topic of topics) {
      if (!topicsByCourse.has(topic.course_id)) topicsByCourse.set(topic.course_id, []);
      topicsByCourse.get(topic.course_id).push({
        id: topic.id,
        title: topic.title,
        materials: materialsByTopic.get(topic.id) || []
      });
    }

    for (const [topicKey, topicMaterials] of materialsByTopic.entries()) {
      if (!topicKey.endsWith(':uncategorized')) continue;
      const courseId = topicKey.replace(/:uncategorized$/, '');
      if (!topicsByCourse.has(courseId)) topicsByCourse.set(courseId, []);
      topicsByCourse.get(courseId).push({
        id: topicKey,
        title: 'Uncategorized',
        materials: topicMaterials
      });
    }

    return {
      generated_at: new Date().toISOString(),
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        teacher: course.teacher,
        url: course.url,
        created_at: course.created_at,
        section: course.section,
        description: course.description,
        room: course.room,
        topics: topicsByCourse.get(course.id) || []
      }))
    };
  }

  setState(key, value) {
    this.db
      .prepare(
        `
        INSERT INTO crawl_state (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `
      )
      .run(key, stringify(value));
  }

  close() {
    this.db.close();
  }
}
