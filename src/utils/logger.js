import path from 'node:path';
import fs from 'fs-extra';
import winston from 'winston';
import { config } from '../config.js';

let cachedLogger;

export async function createLogger(activeConfig = config) {
  if (cachedLogger) return cachedLogger;

  await fs.ensureDir(activeConfig.paths.logsDir);
  const logPath = path.join(activeConfig.paths.logsDir, 'archiver.log');

  cachedLogger = winston.createLogger({
    level: activeConfig.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const suffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${stack || message}${suffix}`;
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message }) => `${level}: ${message}`)
        )
      }),
      new winston.transports.File({ filename: logPath })
    ]
  });

  return cachedLogger;
}
