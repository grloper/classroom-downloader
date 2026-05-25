import path from 'node:path';
import fs from 'fs-extra';
import { safeFilename, nextAvailablePath, outputRelativePath } from '../utils/paths.js';
import { config } from '../config.js';

export async function saveAttachmentReference({ attachment, destinationDir, activeConfig = config }) {
  const baseName = safeFilename(attachment.filename || attachment.provider || 'reference');
  const targetPath = await nextAvailablePath(path.join(destinationDir, `${baseName}.reference.json`));
  const payload = {
    id: attachment.id,
    provider: attachment.provider,
    filename: attachment.filename,
    mime_type: attachment.mime_type,
    download_url: attachment.download_url,
    source_url: attachment.source_url,
    saved_at: new Date().toISOString(),
    raw: attachment.raw_json ? JSON.parse(attachment.raw_json) : undefined
  };

  await fs.ensureDir(destinationDir);
  await fs.writeJson(targetPath, payload, { spaces: 2 });

  return {
    status: 'complete',
    local_path: outputRelativePath(targetPath, activeConfig),
    bytes: Buffer.byteLength(JSON.stringify(payload)),
    raw: {
      downloaded_files: [
        {
          label: 'reference',
          filename: path.basename(targetPath),
          mime_type: 'application/json',
          local_path: outputRelativePath(targetPath, activeConfig)
        }
      ]
    }
  };
}
