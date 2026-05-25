import {
  normalizeAnnouncement,
  normalizeCourse,
  normalizeCourseWork,
  normalizeCourseWorkMaterial,
  normalizeTopic
} from '../parsers/classroom.js';
import { retry, sleep } from '../utils/retry.js';
import { config } from '../config.js';

async function listAll(fetchPage, key, params = {}, options = {}) {
  const activeConfig = options.config || config;
  const logger = options.logger;
  const items = [];
  let pageToken;

  do {
    await sleep(activeConfig.requestDelayMs);
    const response = await retry(
      () =>
        fetchPage({
          ...params,
          pageToken,
          pageSize: params.pageSize || 100
        }),
      { retries: activeConfig.maxRetries, logger }
    );
    items.push(...(response.data?.[key] || []));
    pageToken = response.data?.nextPageToken;
  } while (pageToken);

  return items;
}

async function safeList(label, fn, fallback, logger) {
  try {
    return await fn();
  } catch (error) {
    logger?.warn?.(`Skipping ${label}: ${error.message}`);
    return fallback;
  }
}

export async function crawlViaApi({ classroom, logger, activeConfig = config }) {
  logger?.info?.('Discovering Classroom courses through Google Classroom API');
  const courses = await listAll(
    (params) => classroom.courses.list(params),
    'courses',
    { courseStates: activeConfig.courseStates },
    { config: activeConfig, logger }
  );

  const result = {
    courses: [],
    topics: [],
    materials: [],
    attachments: []
  };

  for (const course of courses) {
    logger?.info?.(`Crawling course: ${course.name || course.id}`);

    const teachers = await safeList(
      `teachers for ${course.id}`,
      () =>
        listAll(
          (params) => classroom.courses.teachers.list(params),
          'teachers',
          { courseId: course.id },
          { config: activeConfig, logger }
        ),
      [],
      logger
    );

    const normalizedCourse = normalizeCourse(course, teachers);
    result.courses.push(normalizedCourse);

    const topics = await safeList(
      `topics for ${course.id}`,
      () =>
        listAll(
          (params) => classroom.courses.topics.list(params),
          'topic',
          { courseId: course.id },
          { config: activeConfig, logger }
        ),
      [],
      logger
    );

    const normalizedTopics = topics.map((topic, index) => normalizeTopic(course.id, topic, index));
    result.topics.push(...normalizedTopics);

    const courseWork = await safeList(
      `coursework for ${course.id}`,
      () =>
        listAll(
          (params) => classroom.courses.courseWork.list(params),
          'courseWork',
          { courseId: course.id, courseWorkStates: ['PUBLISHED'] },
          { config: activeConfig, logger }
        ),
      [],
      logger
    );

    const courseWorkMaterials = await safeList(
      `materials for ${course.id}`,
      () =>
        listAll(
          (params) => classroom.courses.courseWorkMaterials.list(params),
          'courseWorkMaterial',
          { courseId: course.id, courseWorkMaterialStates: ['PUBLISHED'] },
          { config: activeConfig, logger }
        ),
      [],
      logger
    );

    const announcements = await safeList(
      `announcements for ${course.id}`,
      () =>
        listAll(
          (params) => classroom.courses.announcements.list(params),
          'announcements',
          { courseId: course.id, announcementStates: ['PUBLISHED'] },
          { config: activeConfig, logger }
        ),
      [],
      logger
    );

    const normalizedMaterials = [
      ...courseWork.map((item) => normalizeCourseWork(course.id, item)),
      ...courseWorkMaterials.map((item) => normalizeCourseWorkMaterial(course.id, item)),
      ...announcements.map((item) => normalizeAnnouncement(course.id, item))
    ];

    result.materials.push(...normalizedMaterials);
    for (const material of normalizedMaterials) {
      result.attachments.push(...material.attachments);
    }
  }

  logger?.info?.(
    `API crawl complete: ${result.courses.length} courses, ${result.materials.length} materials, ${result.attachments.length} attachments`
  );
  return result;
}

export function persistCrawlResult(db, result) {
  db.transaction(() => {
    for (const course of result.courses) db.upsertCourse(course);
    for (const topic of result.topics) db.upsertTopic(topic);
    for (const material of result.materials) db.upsertMaterial(material);
    for (const attachment of result.attachments) db.upsertAttachment(attachment);
    db.setState('last_crawl', {
      generated_at: new Date().toISOString(),
      counts: {
        courses: result.courses.length,
        topics: result.topics.length,
        materials: result.materials.length,
        attachments: result.attachments.length
      }
    });
  });
}
