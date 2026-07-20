/**
 * Google Classroom REST client (browser). Uses the exact endpoints, states and
 * response keys as the Node engine's apiCrawler so both produce equivalent data.
 */
import { googleFetch, sleep } from './googleFetch.js';

const BASE = 'https://classroom.googleapis.com/v1';

function buildUrl(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
    else url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Fetch all pages of a list endpoint and concatenate `key`. */
async function listAll(session, path, key, params = {}, { delayMs = 120, signal } = {}) {
  const items = [];
  let pageToken;
  do {
    if (delayMs) await sleep(delayMs);
    const data = await googleFetch(session, buildUrl(path, { ...params, pageToken, pageSize: params.pageSize || 100 }), {
      signal
    });
    if (Array.isArray(data?.[key])) items.push(...data[key]);
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return items;
}

/** Run a list call but treat permission/404 gaps as "empty" instead of fatal. */
async function safeList(label, fn, onWarn) {
  try {
    return await fn();
  } catch (err) {
    onWarn?.(`Skipped ${label}: ${err.message}`);
    return [];
  }
}

export function listCourses(session, courseStates, opts) {
  return listAll(session, '/courses', 'courses', { courseStates }, opts);
}

export function listTeachers(session, courseId, opts) {
  return listAll(session, `/courses/${courseId}/teachers`, 'teachers', {}, opts);
}

export function listTopics(session, courseId, opts) {
  return listAll(session, `/courses/${courseId}/topics`, 'topic', {}, opts);
}

export function listCourseWork(session, courseId, opts) {
  return listAll(session, `/courses/${courseId}/courseWork`, 'courseWork', { courseWorkStates: ['PUBLISHED'] }, opts);
}

export function listCourseWorkMaterials(session, courseId, opts) {
  return listAll(
    session,
    `/courses/${courseId}/courseWorkMaterials`,
    'courseWorkMaterial',
    { courseWorkMaterialStates: ['PUBLISHED'] },
    opts
  );
}

export function listAnnouncements(session, courseId, opts) {
  return listAll(
    session,
    `/courses/${courseId}/announcements`,
    'announcements',
    { announcementStates: ['PUBLISHED'] },
    opts
  );
}

export { safeList };
