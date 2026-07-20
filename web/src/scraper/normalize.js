/**
 * Browser-safe port of the Node engine's `src/parsers/classroom.js`.
 *
 * It turns raw Google Classroom API responses into the same normalized
 * entities the Node engine writes to SQLite, so archives produced in the
 * browser and archives produced by the CLI share one data model and are
 * interchangeable in the viewer. The only difference is the ID hash function
 * (see util/hash.js) — IDs are opaque to the viewer, so this is safe.
 */
import { shortHash as hash } from '../util/hash.js';

export function formatDueDate(dueDate, dueTime) {
  if (!dueDate?.year || !dueDate?.month || !dueDate?.day) return null;
  const yyyy = String(dueDate.year).padStart(4, '0');
  const mm = String(dueDate.month).padStart(2, '0');
  const dd = String(dueDate.day).padStart(2, '0');
  if (!dueTime) return `${yyyy}-${mm}-${dd}`;
  const hour = String(dueTime.hours || 0).padStart(2, '0');
  const minute = String(dueTime.minutes || 0).padStart(2, '0');
  const second = String(dueTime.seconds || 0).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hour}:${minute}:${second}`;
}

export function mapCourseWorkType(courseWork) {
  if (courseWork?.quizSettings) return 'quiz';
  if (['SHORT_ANSWER_QUESTION', 'MULTIPLE_CHOICE_QUESTION'].includes(courseWork?.workType)) return 'question';
  return 'assignment';
}

export function normalizeCourse(course, teachers = []) {
  const teacherNames = teachers
    .map((teacher) => teacher?.profile?.name?.fullName || teacher?.userId)
    .filter(Boolean);
  return {
    id: course.id,
    name: course.name || course.section || course.id,
    url: course.alternateLink || `https://classroom.google.com/c/${course.id}`,
    teacher: teacherNames.join(', ') || course.ownerId || '',
    created_at: course.creationTime || null,
    section: course.section || '',
    description: course.description || '',
    room: course.room || '',
    raw: course
  };
}

export function normalizeTopic(courseId, topic, position = 0) {
  return {
    id: topic.topicId || topic.id || `${courseId}:topic:${hash(topic.name || position)}`,
    course_id: courseId,
    title: topic.name || 'Untitled topic',
    position,
    raw: topic
  };
}

function normalizeDriveAttachment(materialId, driveFile) {
  const file = driveFile.driveFile || driveFile;
  const fileId = file.id || hash(file.alternateLink || file.title || materialId);
  return {
    id: `${materialId}:drive:${fileId}`,
    material_id: materialId,
    filename: file.title || file.name || fileId,
    mime_type: file.mimeType || '',
    local_path: null,
    download_url: null,
    source_url: file.alternateLink || file.webViewLink || null,
    provider: 'drive',
    file_id: fileId,
    raw: driveFile
  };
}

function normalizeLinkAttachment(materialId, link) {
  const url = link.url || link.href;
  return {
    id: `${materialId}:link:${hash(url)}`,
    material_id: materialId,
    filename: link.title || url || 'link',
    mime_type: 'text/uri-list',
    local_path: null,
    download_url: url,
    source_url: url,
    provider: 'link',
    file_id: null,
    raw: link
  };
}

function normalizeYoutubeAttachment(materialId, video) {
  const url = video.alternateLink || `https://www.youtube.com/watch?v=${video.id || ''}`;
  return {
    id: `${materialId}:youtube:${hash(url)}`,
    material_id: materialId,
    filename: video.title || video.id || 'youtube-video',
    mime_type: 'application/vnd.youtube.video',
    local_path: null,
    download_url: null,
    source_url: url,
    provider: 'youtube',
    file_id: video.id || null,
    raw: video
  };
}

function normalizeFormAttachment(materialId, form) {
  const url = form.formUrl || form.responseUrl || form.thumbnailUrl;
  return {
    id: `${materialId}:form:${hash(url || form.title || materialId)}`,
    material_id: materialId,
    filename: form.title || 'google-form',
    mime_type: 'application/vnd.google-apps.form',
    local_path: null,
    download_url: null,
    source_url: url || null,
    provider: 'form',
    file_id: null,
    raw: form
  };
}

export function extractAttachments(materials = [], materialId) {
  const attachments = [];
  for (const material of materials || []) {
    if (material.driveFile) attachments.push(normalizeDriveAttachment(materialId, material.driveFile));
    if (material.link) attachments.push(normalizeLinkAttachment(materialId, material.link));
    if (material.youtubeVideo) attachments.push(normalizeYoutubeAttachment(materialId, material.youtubeVideo));
    if (material.form) attachments.push(normalizeFormAttachment(materialId, material.form));
  }
  return attachments;
}

export function normalizeCourseWork(courseId, courseWork) {
  const id = `${courseId}:courseWork:${courseWork.id}`;
  return {
    id,
    course_id: courseId,
    topic_id: courseWork.topicId || null,
    title: courseWork.title || 'Untitled coursework',
    description: courseWork.description || '',
    type: mapCourseWorkType(courseWork),
    due_date: formatDueDate(courseWork.dueDate, courseWork.dueTime),
    local_path: null,
    source_url: courseWork.alternateLink || null,
    raw: courseWork,
    attachments: extractAttachments(courseWork.materials, id)
  };
}

export function normalizeCourseWorkMaterial(courseId, material) {
  const id = `${courseId}:material:${material.id}`;
  return {
    id,
    course_id: courseId,
    topic_id: material.topicId || null,
    title: material.title || 'Untitled material',
    description: material.description || '',
    type: 'material',
    due_date: null,
    local_path: null,
    source_url: material.alternateLink || null,
    raw: material,
    attachments: extractAttachments(material.materials, id)
  };
}

export function normalizeAnnouncement(courseId, announcement) {
  const id = `${courseId}:announcement:${announcement.id}`;
  return {
    id,
    course_id: courseId,
    topic_id: null,
    title: announcement.text?.split('\n')[0]?.slice(0, 120) || 'Announcement',
    description: announcement.text || '',
    type: 'announcement',
    due_date: null,
    local_path: null,
    source_url: announcement.alternateLink || null,
    raw: announcement,
    attachments: extractAttachments(announcement.materials, id)
  };
}
