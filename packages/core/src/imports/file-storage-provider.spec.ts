import { afterEach, describe, expect, it, vi } from 'vitest';

import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';

import { Clock } from '../platform/clock';
import { resetEnvForTests } from '../platform/config/env';
import { createFileStorageDriver } from '../platform/file-storage/file-storage.provider';

const csv = { sizeBytes: 120, contentType: 'text/csv' };
const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
const r2 = {
  R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  R2_BUCKET: 'dakly-production',
  R2_ACCESS_KEY_ID: 'test-only',
  R2_SECRET_ACCESS_KEY: 'test-only-secret',
};

function configuredDriver(source: NodeJS.ProcessEnv) {
  for (const name of Object.keys({ ...base, ...r2, NODE_ENV: '' })) vi.stubEnv(name, source[name]);
  resetEnvForTests();
  return createFileStorageDriver(new Clock());
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe('File storage driver configuration', () => {
  it('uses the configured local SeaweedFS bucket in development', () => {
    const driver = configuredDriver({
      ...base,
      R2_ENDPOINT: 'http://127.0.0.1:8333',
      R2_BUCKET: 'dakly-local',
      R2_ACCESS_KEY_ID: 'dakly-local',
      R2_SECRET_ACCESS_KEY: 'dakly-local-secret',
    });
    expect(driver.createUploadUrl('imports/a/b.csv', 60, csv)).toMatch(
      /^http:\/\/127\.0\.0\.1:8333\/dakly-local\/imports\/a\/b\.csv\?/,
    );
  });

  it.each(Object.keys(r2))('refuses production without %s', (name) => {
    const env = { ...base, ...r2, NODE_ENV: 'production', [name]: undefined };
    expect(() => configuredDriver(env)).toThrow(name);
  });

  it('signs for the configured R2 bucket in production', () => {
    const driver = configuredDriver({ ...base, ...r2, NODE_ENV: 'production' });
    expect(driver).toBeInstanceOf(S3FileStorageDriver);
    expect(driver.createDownloadUrl('imports/a/b.csv', 60)).toMatch(
      /^https:\/\/account\.r2\.cloudflarestorage\.com\/dakly-production\//,
    );
  });
});
