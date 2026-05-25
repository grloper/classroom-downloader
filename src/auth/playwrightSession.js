import { chromium } from 'playwright';
import fs from 'fs-extra';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from '../config.js';

export async function launchClassroomContext(options = {}) {
  const activeConfig = options.config || config;
  await fs.ensureDir(activeConfig.session.userDataDir);
  await fs.ensureDir(activeConfig.paths.outputRoot);

  return chromium.launchPersistentContext(activeConfig.session.userDataDir, {
    headless: options.headless ?? activeConfig.headless,
    acceptDownloads: true,
    downloadsPath: activeConfig.paths.outputRoot,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US'
  });
}

export async function saveStorageState(context, activeConfig = config) {
  await fs.ensureDir(activeConfig.paths.sessionsDir);
  await context.storageState({ path: activeConfig.session.storageStateFile });
}

async function waitForUser(message) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

export async function ensureClassroomLogin(options = {}) {
  const activeConfig = options.config || config;
  const context = await launchClassroomContext({
    config: activeConfig,
    headless: options.headless ?? false
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://classroom.google.com/', { waitUntil: 'domcontentloaded' });

  if (activeConfig.google.email) {
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(activeConfig.google.email);
      await page.keyboard.press('Enter');
    }
  }

  console.log('\nComplete Google sign-in in the opened browser window.');
  console.log('MFA, consent, school SSO, and risk checks are expected to happen there.');
  await waitForUser('Press Enter here after Google Classroom has loaded...');

  await page.goto('https://classroom.google.com/', { waitUntil: 'networkidle' }).catch(async () => {
    await page.goto('https://classroom.google.com/', { waitUntil: 'domcontentloaded' });
  });

  await saveStorageState(context, activeConfig);
  await context.close();
}
