import path from 'node:path';
import fs from 'fs-extra';
import { config } from '../config.js';
import { safeSegment } from '../utils/paths.js';

export async function exportArchive(db, activeConfig = config) {
  const graph = db.getCoursesGraph();
  const masterPath = path.join(activeConfig.paths.outputRoot, 'master_index.json');
  await fs.ensureDir(activeConfig.paths.outputRoot);
  await fs.writeJson(masterPath, graph, { spaces: 2 });

  for (const course of graph.courses) {
    const courseDir = path.join(activeConfig.paths.coursesRoot, safeSegment(course.name || course.id));
    await fs.ensureDir(courseDir);
    await fs.writeJson(path.join(courseDir, 'course.json'), course, { spaces: 2 });

    for (const topic of course.topics) {
      const topicDir = path.join(courseDir, safeSegment(topic.title || topic.id));
      await fs.ensureDir(topicDir);
      await fs.writeJson(path.join(topicDir, 'topic.json'), topic, { spaces: 2 });
    }
  }

  db.setState('last_export', {
    generated_at: graph.generated_at,
    path: masterPath,
    courses: graph.courses.length
  });

  return { masterPath, graph };
}
