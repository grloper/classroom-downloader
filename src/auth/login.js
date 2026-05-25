import { getOAuthClient } from './googleApi.js';
import { ensureClassroomLogin } from './playwrightSession.js';
import { config } from '../config.js';
import { ensureProjectFolders } from '../utils/paths.js';
import { createLogger } from '../utils/logger.js';
import { hasFlag } from '../utils/args.js';

async function main() {
  await ensureProjectFolders(config);
  const logger = await createLogger(config);

  const browserOnly = hasFlag('--browser-only');
  const withBrowser = hasFlag('--with-browser') || browserOnly;

  if (withBrowser) {
    logger.warn('Google may block sign-in from Playwright-controlled browsers. Prefer the default OAuth login.');
    await ensureClassroomLogin({ config, headless: false });
    logger.info(`Saved Playwright session to ${config.session.storageStateFile}`);
  }

  if (!browserOnly) {
    try {
      await getOAuthClient({ config, interactive: true });
      logger.info(`Saved Google OAuth token to ${config.google.tokenPath}`);
    } catch (error) {
      logger.warn(error.message);
      logger.warn('Skipping API OAuth setup. Add credentials/oauth-client.json, then run npm run login.');
    }
  }

  if (config.google.passwordProvided) {
    logger.warn('GOOGLE_PASSWORD is set but intentionally unused; use browser/OAuth login instead.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
