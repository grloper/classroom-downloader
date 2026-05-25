import path from 'node:path';
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import fs from 'fs-extra';
import { safeFilename, nextAvailablePath, outputRelativePath } from '../utils/paths.js';
import { retry } from '../utils/retry.js';
import { config } from '../config.js';

const GOOGLE_EXPORT_TARGETS = {
  'application/vnd.google-apps.document': [
    {
      label: 'pdf',
      extension: '.pdf',
      mimeType: 'application/pdf'
    },
    {
      label: 'docx',
      extension: '.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  ],
  'application/vnd.google-apps.presentation': [
    {
      label: 'pdf',
      extension: '.pdf',
      mimeType: 'application/pdf'
    },
    {
      label: 'pptx',
      extension: '.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
  ],
  'application/vnd.google-apps.spreadsheet': [
    {
      label: 'xlsx',
      extension: '.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    {
      label: 'csv',
      extension: '.csv',
      mimeType: 'text/csv'
    }
  ],
  'application/vnd.google-apps.drawing': [
    {
      label: 'png',
      extension: '.png',
      mimeType: 'image/png'
    },
    {
      label: 'pdf',
      extension: '.pdf',
      mimeType: 'application/pdf'
    }
  ],
  'application/vnd.google-apps.jam': [
    {
      label: 'pdf',
      extension: '.pdf',
      mimeType: 'application/pdf'
    }
  ]
};

function extensionFromName(name, fallback = '') {
  const ext = path.extname(name || '');
  return ext || fallback;
}

function isGoogleWorkspaceFile(mimeType) {
  return mimeType?.startsWith('application/vnd.google-apps.');
}

async function writeStreamToFile(stream, targetPath) {
  await fs.ensureDir(path.dirname(targetPath));
  const partialPath = `${targetPath}.part`;
  await fs.remove(partialPath);

  const hash = crypto.createHash('sha256');
  let bytes = 0;

  stream.on('data', (chunk) => {
    bytes += chunk.length;
    hash.update(chunk);
  });

  await pipeline(stream, createWriteStream(partialPath));
  await fs.move(partialPath, targetPath, { overwrite: true });

  return {
    bytes,
    checksum: hash.digest('hex')
  };
}

async function getFileMetadata(drive, fileId, logger, activeConfig) {
  const response = await retry(
    () =>
      drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'id,name,mimeType,size,md5Checksum,modifiedTime,webViewLink,webContentLink'
      }),
    { retries: activeConfig.maxRetries, logger }
  );
  return response.data;
}

async function exportGoogleWorkspaceFile(drive, fileId, target, targetPath, logger, activeConfig) {
  const response = await retry(
    () =>
      drive.files.export(
        {
          fileId,
          mimeType: target.mimeType
        },
        {
          responseType: 'stream'
        }
      ),
    { retries: activeConfig.maxRetries, logger }
  );

  return writeStreamToFile(response.data, targetPath);
}

async function downloadBinaryFile(drive, fileId, targetPath, logger, activeConfig) {
  const response = await retry(
    () =>
      drive.files.get(
        {
          fileId,
          alt: 'media',
          supportsAllDrives: true
        },
        {
          responseType: 'stream'
        }
      ),
    { retries: activeConfig.maxRetries, logger }
  );

  return writeStreamToFile(response.data, targetPath);
}

export async function downloadDriveAttachment({ drive, attachment, destinationDir, logger, activeConfig = config }) {
  if (!attachment.file_id) {
    throw new Error(`Drive attachment ${attachment.id} is missing file_id`);
  }

  const metadata = await getFileMetadata(drive, attachment.file_id, logger, activeConfig);
  const filenameBase = safeFilename(path.parse(metadata.name || attachment.filename || attachment.file_id).name);
  const downloadedFiles = [];

  if (isGoogleWorkspaceFile(metadata.mimeType)) {
    const targets = GOOGLE_EXPORT_TARGETS[metadata.mimeType] || [
      {
        label: 'pdf',
        extension: '.pdf',
        mimeType: 'application/pdf'
      }
    ];

    for (const target of targets) {
      const targetPath = await nextAvailablePath(path.join(destinationDir, `${filenameBase}${target.extension}`));
      const result = await exportGoogleWorkspaceFile(drive, attachment.file_id, target, targetPath, logger, activeConfig);
      downloadedFiles.push({
        label: target.label,
        filename: path.basename(targetPath),
        mime_type: target.mimeType,
        local_path: outputRelativePath(targetPath, activeConfig),
        bytes: result.bytes,
        checksum: result.checksum
      });
    }
  } else {
    const targetPath = await nextAvailablePath(
      path.join(destinationDir, `${filenameBase}${extensionFromName(metadata.name, '')}`)
    );
    const result = await downloadBinaryFile(drive, attachment.file_id, targetPath, logger, activeConfig);
    downloadedFiles.push({
      label: 'original',
      filename: path.basename(targetPath),
      mime_type: metadata.mimeType,
      local_path: outputRelativePath(targetPath, activeConfig),
      bytes: result.bytes,
      checksum: result.checksum
    });
  }

  const primary = downloadedFiles[0];
  return {
    status: 'complete',
    filename: metadata.name || primary.filename,
    mime_type: metadata.mimeType || primary.mime_type,
    local_path: primary.local_path,
    bytes: downloadedFiles.reduce((sum, item) => sum + (item.bytes || 0), 0),
    checksum: primary.checksum,
    raw: {
      drive_metadata: metadata,
      downloaded_files: downloadedFiles
    }
  };
}
