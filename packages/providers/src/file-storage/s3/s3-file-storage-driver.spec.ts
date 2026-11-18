import { describe, expect, it } from 'vitest';

import { S3FileStorageDriver, presignS3Url } from './s3-file-storage-driver';

describe('presignS3Url', () => {
  it('matches the presigned GET example in the AWS Signature Version 4 documentation', () => {
    const url = presignS3Url({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      signedAt: new Date('2013-05-24T00:00:00Z'),
      expiresInSeconds: 86400,
    });

    expect(url.toString()).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });
});

describe('presignS3Url with content headers', () => {
  const request = {
    method: 'PUT',
    url: new URL('https://account.r2.cloudflarestorage.com/dakly-production/imports/a.csv'),
    region: 'auto',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    signedAt: new Date('2026-11-17T08:30:00Z'),
    expiresInSeconds: 900,
  } as const;
  const csv = { contentType: 'text/csv', sizeBytes: 120 };

  it('signs the content headers in sorted order beside the host', () => {
    const url = presignS3Url({ ...request, upload: csv });
    const reordered = presignS3Url({
      ...request,
      upload: { sizeBytes: 120, contentType: 'text/csv' },
    });

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.toString()).toBe(reordered.toString());
  });

  it('changes the signature when the length or type changes', () => {
    const signature = (upload?: { sizeBytes: number; contentType: string }) =>
      presignS3Url({ ...request, upload }).searchParams.get('X-Amz-Signature');

    expect(signature(csv)).not.toBe(signature({ ...csv, sizeBytes: 121 }));
    expect(signature(csv)).not.toBe(signature({ ...csv, contentType: 'text/plain' }));
    expect(signature(csv)).not.toBe(signature());
  });
});

describe('S3FileStorageDriver', () => {
  const jpeg = { sizeBytes: 2048, contentType: 'image/jpeg' };
  const driver = new S3FileStorageDriver(
    {
      endpoint: 'https://account.r2.cloudflarestorage.com',
      bucket: 'dakly-production',
      region: 'auto',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
    },
    { now: () => new Date('2026-11-17T08:30:00Z') },
  );

  it('addresses the object under the bucket and escapes each part of the key', () => {
    const url = new URL(driver.createUploadUrl('stores/7/photos/শাড়ি (1).jpg', 300, jpeg));

    expect(url.host).toBe('account.r2.cloudflarestorage.com');
    expect(url.pathname).toBe(
      '/dakly-production/stores/7/photos/%E0%A6%B6%E0%A6%BE%E0%A6%A1%E0%A6%BC%E0%A6%BF%20%281%29.jpg',
    );
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261117T083000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('signs uploads and downloads of the same key differently', () => {
    const upload = new URL(driver.createUploadUrl('stores/7/photos/1.jpg', 300, jpeg));
    const download = new URL(driver.createDownloadUrl('stores/7/photos/1.jpg', 300));

    expect(upload.pathname).toBe(download.pathname);
    expect(upload.searchParams.get('X-Amz-Signature')).not.toBe(
      download.searchParams.get('X-Amz-Signature'),
    );
  });
});
