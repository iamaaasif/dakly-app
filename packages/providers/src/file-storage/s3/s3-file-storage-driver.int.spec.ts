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

const text = { sizeBytes: 1, contentType: 'text/plain' };

function put(url: string, body: string | Uint8Array, contentType = 'text/plain') {
  return request(url, { method: 'PUT', body, headers: { 'content-type': contentType } });
}

describe('S3FileStorageDriver (SeaweedFS)', () => {
  it('binds upload size and type and reads the stored object metadata', async () => {
    const driver = driverAt(new Date());
    const key = `stores/${randomUUID()}/products/${randomUUID()}`;
    const url = driver.createUploadUrl(key, 300, { contentType: 'image/png', sizeBytes: 4 });
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: '1234',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: '12345',
        })
      ).status,
    ).toBe(403);
    expect(await driver.getObjectMetadata(key)).toBeNull();
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: '1234',
        })
      ).status,
    ).toBe(200);
    expect(await driver.getObjectMetadata(key)).toEqual({ contentType: 'image/png', sizeBytes: 4 });
  });

  it('stores bytes through the upload URL and returns them through the download URL', async () => {
    const driver = driverAt(new Date());
    const key = `stores/${randomUUID()}/photos/${randomUUID()}.txt`;
    const body = new TextEncoder().encode('লাল জামদানি শাড়ি, ৳4,500');

    const content = { sizeBytes: body.length, contentType: 'text/plain' };
    const upload = await put(driver.createUploadUrl(key, 300, content), body);
    expect(upload.status).toBe(200);

    const download = await request(driver.createDownloadUrl(key, 300));
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(body);
  });

  it('refuses a download URL after it expires', async () => {
    const key = `stores/${randomUUID()}/photos/${randomUUID()}.txt`;
    await put(driverAt(new Date()).createUploadUrl(key, 300, text), 'x');

    const signedTwoMinutesAgo = driverAt(new Date(Date.now() - 120_000));
    const download = await request(signedTwoMinutesAgo.createDownloadUrl(key, 60));
    expect(download.status).toBe(403);
  });

  it('refuses an upload URL whose expiry or key was changed after signing', async () => {
    const driver = driverAt(new Date());
    const key = `stores/${randomUUID()}/photos/${randomUUID()}.txt`;
    const longer = new URL(driver.createUploadUrl(key, 60, text));
    longer.searchParams.set('X-Amz-Expires', '604800');
    const otherKey = new URL(driver.createUploadUrl(key, 60, text));
    otherKey.pathname = otherKey.pathname.replace('.txt', '-other.txt');

    for (const url of [longer, otherKey]) {
      const upload = await put(url.toString(), 'x');
      expect(upload.status).toBe(403);
    }
    const download = await request(driver.createDownloadUrl(key, 60));
    expect(download.status).toBe(404);
  });

  it('writes text the server makes and reads it back with its content type', async () => {
    const driver = driverAt(new Date());
    const key = `imports/${randomUUID()}/${randomUUID()}.csv`;
    const report = 'Row,Field,Problem\r\n"2","phone","ফোন নম্বর দিন"\r\n';

    await driver.writeText(key, report, 'text/csv');

    expect(await driver.readBytes(key, 1_000)).toEqual({
      kind: 'found',
      bytes: Buffer.from(report),
    });
    const download = await request(driver.createDownloadUrl(key, 60));
    expect(download.headers.get('content-type')).toBe('text/csv');
  });

  it('reads a missing file as missing and stops reading past the size limit', async () => {
    const driver = driverAt(new Date());
    const key = `imports/${randomUUID()}/${randomUUID()}.csv`;
    await driver.writeText(key, 'Mobile\n01712345678\n', 'text/csv');

    expect(await driver.readBytes(`${key}-missing`, 1_000)).toEqual({ kind: 'missing' });
    expect(await driver.readBytes(key, 10)).toEqual({ kind: 'too_large' });
    expect(await driver.readBytes(key, 19)).toEqual({
      kind: 'found',
      bytes: Buffer.from('Mobile\n01712345678\n'),
    });
  });

  it('refuses an upload whose length or type differs from the signed one', async () => {
    const driver = driverAt(new Date());
    const key = `imports/${randomUUID()}/${randomUUID()}.csv`;
    const url = driver.createUploadUrl(key, 60, { sizeBytes: 19, contentType: 'text/csv' });
    const csv = 'Mobile\n01712345678\n';

    expect((await put(url, `${csv}x`, 'text/csv')).status).toBe(403);
    expect((await put(url, csv, 'text/html')).status).toBe(403);
    expect((await request(driver.createDownloadUrl(key, 60))).status).toBe(404);
    expect((await put(url, csv, 'text/csv')).status).toBe(200);
  });
});
