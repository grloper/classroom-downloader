import { config, summarizeConfig } from '../config.js';
import { ensureProjectFolders } from '../utils/paths.js';
import { createLogger } from '../utils/logger.js';
import { ArchiveDatabase } from '../storage/database.js';
import { getGoogleClients } from '../auth/googleApi.js';
import { crawlViaApi, persistCrawlResult } from './apiCrawler.js';
import { crawlViaUi } from './uiCrawler.js';
import { downloadAllAttachments } from '../downloaders/downloadManager.js';
import { exportArchive } from '../storage/exporter.js';
import { hasFlag } from '../utils/args.js';

function printHelp() {
  console.log(`
Google Classroom Auto Archiver

Usage:
  node src/crawler/run.js [options]

Options:
  --no-download   Crawl and export metadata without downloading attachments
  --export-only   Regenerate JSON from the current SQLite database
  --api-only      Disable Playwright UI fallback
  --ui-only       Disable API mode and use conservative UI course discovery
  --help          Show this help
`);
}

async function runCrawl({ db, logger }) {
  const noApi = hasFlag('--ui-only') || !config.enableApiMode;
  const noUiFallback = hasFlag('--api-only') || !config.enableUiFallback;
  let drive = null;

  if (!noApi) {
    try {
      const clients = await getGoogleClients({ config, interactive: true });
      drive = clients.drive;
      const result = await crawlViaApi({ classroom: clients.classroom, logger, activeConfig: config });
      persistCrawlResult(db, result);
      return { drive, source: 'api' };
    } catch (error) {
      logger.warn(`API crawl unavailable: ${error.message}`);
      if (noUiFallback) throw error;
    }
  }

  if (!noUiFallback) {
    const result = await crawlViaUi({ logger, activeConfig: config });
    persistCrawlResult(db, result);
    return { drive, source: 'ui' };
  }

  throw new Error('No crawl source available. Enable API mode or UI fallback.');
}

async function main() {
  if (hasFlag('--help')) {
    printHelp();
    return;
  }

  await ensureProjectFolders(config);
  const logger = await createLogger(config);
  logger.info(`Starting archive with config ${JSON.stringify(summarizeConfig(config))}`);

  if (config.google.passwordProvided) {
    logger.warn('GOOGLE_PASSWORD is set but intentionally unused; persistent sessions and OAuth tokens are used instead.');
  }

  const db = new ArchiveDatabase(config.paths.dbPath);

  try {
    let drive = null;
    let source = 'database';

    if (!hasFlag('--export-only')) {
      const crawl = await runCrawl({ db, logger });
      drive = crawl.drive;
      source = crawl.source;
      logger.info(`Persisted crawl results from ${source}; counts: ${JSON.stringify(db.getCounts())}`);
    }

    if (!hasFlag('--no-download') && !hasFlag('--export-only')) {
      await downloadAllAttachments({ db, drive, logger, activeConfig: config });
    }

    const { masterPath, graph } = await exportArchive(db, config);
    logger.info(`Archive exported to ${masterPath} with ${graph.courses.length} courses`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
