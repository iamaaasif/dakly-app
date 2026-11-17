import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { S3FileStorageDriver } from './s3-file-storage-driver';

const configuration = {
  endpoint: process.env.R2_ENDPOINT ?? 'http://127.0.0.1:8333',
  bucket: process.env.R2_BUCKET ?? 'dakly-local',
  region: 'auto',
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? 'dakly-local',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? 'dakly-local-secret',
};

function driverAt(now: Date): S3FileStorageDriver {
  return new S3FileStorageDriver(configuration, { now: () => now });
}

function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
}

describe('S3FileStorageDriver (SeaweedFS)', () => {
  it('stores bytes through the upload URL and returns them through the download URL', async () => {
    const driver = driverAt(new Date());
    const key = `stores/${randomUUID()}/photos/${randomUUID()}.txt`;
    const body = new TextEncoder().encode('লাল জামদানি শাড়ি, ৳4,500');

    const upload = await request(driver.createUploadUrl(key, 300), { method: 'PUT', body });
    expect(upload.status).toBe(200);

    const download = await request(driver.createDownloadUrl(key, 300));
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(body);
  });

  it('refuses a download URL after it expires', async () => {
    const key = `stores/${randomUUID()}/photos/${randomUUID()}.txt`;
    await request(driverAt(new Date()).createUploadUrl(key, 300), { method: 'PUT', body: 'x' });

    const signedTwoMinutesAgo = driverAt(new Date(Date.now() - 120_000));
    const download = await request(signedTwoMinutesAgo.createDownloadUrl(key, 60));
    expect(download.status).toBe(403);
  });

  it('refuses an upload URL whose expiry or key was changed after signing', async () => {
    const driver = driverAt(new Date());
    const key = `stores/${randomUUID()}/photos/${randomUUID()}.txt`;
    const longer = new URL(driver.createUploadUrl(key, 60));
    longer.searchParams.set('X-Amz-Expires', '604800');
    const otherKey = new URL(driver.createUploadUrl(key, 60));
    otherKey.pathname = otherKey.pathname.replace('.txt', '-other.txt');

    for (const url of [longer, otherKey]) {
      const upload = await request(url.toString(), { method: 'PUT', body: 'x' });
      expect(upload.status).toBe(403);
    }
    const download = await request(driver.createDownloadUrl(key, 60));
    expect(download.status).toBe(404);
  });
});
