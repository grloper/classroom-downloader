import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config();

const rootDir = process.cwd();

function resolveFromRoot(value, fallback) {
  const input = value || fallback;
  return path.isAbsolute(input) ? input : path.resolve(rootDir, input);
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  rootDir,
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  headless: parseBool(process.env.HEADLESS, true),
  enableApiMode: parseBool(process.env.ENABLE_API_MODE, true),
  enableUiFallback: parseBool(process.env.ENABLE_UI_FALLBACK, true),
  maxConcurrentDownloads: parseInteger(process.env.MAX_CONCURRENT_DOWNLOADS, 5),
  requestDelayMs: parseInteger(process.env.REQUEST_DELAY_MS, 250),
  maxRetries: parseInteger(process.env.MAX_RETRIES, 4),
  courseStates: parseList(process.env.COURSE_STATES, ['ACTIVE', 'ARCHIVED']),
  apiPort: parseInteger(process.env.API_PORT, 4317),
  paths: {
    outputRoot: resolveFromRoot(process.env.DOWNLOAD_PATH, './output'),
    coursesRoot: path.join(resolveFromRoot(process.env.DOWNLOAD_PATH, './output'), 'courses'),
    dbPath: resolveFromRoot(process.env.DB_PATH, './database/classroom.db'),
    logsDir: resolveFromRoot(process.env.LOGS_PATH, './logs'),
    sessionsDir: resolveFromRoot(process.env.SESSIONS_PATH, './sessions'),
    credentialsDir: resolveFromRoot(process.env.CREDENTIALS_PATH, './credentials')
  },
  session: {
    storageStateFile: resolveFromRoot(process.env.STORAGE_STATE_FILE, './sessions/auth.json'),
    userDataDir: resolveFromRoot(process.env.PLAYWRIGHT_USER_DATA_DIR, './sessions/chromium')
  },
  google: {
    email: process.env.GOOGLE_EMAIL || '',
    passwordProvided: Boolean(process.env.GOOGLE_PASSWORD),
    applicationCredentials: resolveFromRoot(
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      './credentials/oauth-client.json'
    ),
    tokenPath: resolveFromRoot(process.env.GOOGLE_OAUTH_TOKEN_PATH, './sessions/google-oauth-token.json'),
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost'
  }
};

export function summarizeConfig(activeConfig = config) {
  return {
    headless: activeConfig.headless,
    enableApiMode: activeConfig.enableApiMode,
    enableUiFallback: activeConfig.enableUiFallback,
    maxConcurrentDownloads: activeConfig.maxConcurrentDownloads,
    requestDelayMs: activeConfig.requestDelayMs,
    courseStates: activeConfig.courseStates,
    outputRoot: activeConfig.paths.outputRoot,
    dbPath: activeConfig.paths.dbPath,
    storageStateFile: activeConfig.session.storageStateFile,
    googleCredentials: activeConfig.google.applicationCredentials,
    googleTokenPath: activeConfig.google.tokenPath
  };
}
