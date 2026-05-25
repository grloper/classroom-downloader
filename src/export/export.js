import { ArchiveDatabase } from '../storage/database.js';
import { exportArchive } from '../storage/exporter.js';
import { config } from '../config.js';
import { ensureProjectFolders } from '../utils/paths.js';
import { createLogger } from '../utils/logger.js';

async function main() {
  await ensureProjectFolders(config);
  const logger = await createLogger(config);
  const db = new ArchiveDatabase(config.paths.dbPath);

  try {
    const { masterPath, graph } = await exportArchive(db, config);
    logger.info(`Exported ${graph.courses.length} courses to ${masterPath}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
