import { describe, expect, it } from 'vitest';

import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { createFileStorageDriver } from './file-storage-provider';

const csv = { contentLength: 120, contentType: 'text/csv' };
const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
const r2 = {
  R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  R2_BUCKET: 'dakly-production',
  R2_ACCESS_KEY_ID: 'test-only',
  R2_SECRET_ACCESS_KEY: 'test-only-secret',
};

describe('File storage driver configuration', () => {
  it('uses the local SeaweedFS bucket in development', () => {
    const driver = createFileStorageDriver(new Clock(), loadEnv(base));
    expect(driver.createUploadUrl('imports/a/b.csv', 60, csv)).toMatch(
      /^http:\/\/127\.0\.0\.1:8333\/dakly-local\/imports\/a\/b\.csv\?/,
    );
  });

  it.each(Object.keys(r2))('refuses production without %s', (name) => {
    const env = loadEnv({ ...base, ...r2, NODE_ENV: 'production', [name]: undefined });
    expect(() => createFileStorageDriver(new Clock(), env)).toThrow(name);
  });

  it('signs for the configured R2 bucket in production', () => {
    const driver = createFileStorageDriver(
      new Clock(),
      loadEnv({ ...base, ...r2, NODE_ENV: 'production' }),
    );
    expect(driver).toBeInstanceOf(S3FileStorageDriver);
    expect(driver.createDownloadUrl('imports/a/b.csv', 60)).toMatch(
      /^https:\/\/account\.r2\.cloudflarestorage\.com\/dakly-production\//,
    );
  });
});
