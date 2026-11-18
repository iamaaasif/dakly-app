import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';

import { Clock } from '../clock';
import { loadEnv } from '../config/env';

export const FILE_STORAGE_DRIVER = Symbol('FILE_STORAGE_DRIVER');

export function createFileStorageDriver(clock: Clock): S3FileStorageDriver {
  const env = loadEnv();
  if (!env.R2_ENDPOINT || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    throw new Error(
      'File storage requires R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY',
    );
  return new S3FileStorageDriver(
    {
      endpoint: env.R2_ENDPOINT,
      bucket: env.R2_BUCKET,
      region: 'auto',
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    clock,
  );
}
