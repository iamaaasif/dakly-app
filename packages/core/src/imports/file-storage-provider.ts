import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';

import type { Clock } from '../platform/clock';
import { type Env, loadEnv } from '../platform/config/env';

export const FILE_STORAGE_DRIVER = Symbol('FILE_STORAGE_DRIVER');

// The SeaweedFS bucket in docker-compose.yml.
const LOCAL_BUCKET = {
  endpoint: 'http://127.0.0.1:8333',
  bucket: 'dakly-local',
  accessKeyId: 'dakly-local',
  secretAccessKey: 'dakly-local-secret',
};

export function createFileStorageDriver(clock: Clock, env: Env = loadEnv()): FileStorageDriver {
  const {
    R2_ENDPOINT: endpoint,
    R2_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = env;
  if (endpoint && bucket && accessKeyId && secretAccessKey)
    return new S3FileStorageDriver(
      { endpoint, bucket, accessKeyId, secretAccessKey, region: 'auto' },
      clock,
    );
  if (env.NODE_ENV === 'production')
    throw new Error(
      'Production requires R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY',
    );
  return new S3FileStorageDriver({ ...LOCAL_BUCKET, region: 'auto' }, clock);
}
