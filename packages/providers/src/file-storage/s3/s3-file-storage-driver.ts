import { createHash, createHmac } from 'node:crypto';

import type { FileObjectMetadata, FileStorageDriver } from '../file-storage-driver';

export type S3Configuration = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type PresignRequest = {
  method: 'GET' | 'PUT' | 'HEAD';
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  signedAt: Date;
  expiresInSeconds: number;
  upload?: FileObjectMetadata;
};

// Plain S3 with path-style URLs, so the same driver serves Cloudflare R2 and the local stand-in.
export class S3FileStorageDriver implements FileStorageDriver {
  constructor(
    private readonly configuration: S3Configuration,
    private readonly clock: { now(): Date },
  ) {}

  createUploadUrl(key: string, expiresInSeconds: number, upload?: FileObjectMetadata): string {
    return this.presign('PUT', key, expiresInSeconds, upload);
  }

  createDownloadUrl(key: string, expiresInSeconds: number): string {
    return this.presign('GET', key, expiresInSeconds);
  }

  async getObjectMetadata(key: string): Promise<FileObjectMetadata | null> {
    try {
      const response = await fetch(this.presign('HEAD', key, 60), {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404) return null;
      const length = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      const sizeBytes = Number(length);
      if (
        !response.ok ||
        !contentType ||
        length === null ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0
      )
        throw new Error('Invalid object metadata');
      return { contentType, sizeBytes };
    } catch {
      // Signed URLs contain credentials; keep vendor errors inside the driver.
      throw Object.assign(new Error('File storage request failed'), {
        code: 'FILE_STORAGE_UNAVAILABLE',
      });
    }
  }

  private presign(
    method: PresignRequest['method'],
    key: string,
    expiresInSeconds: number,
    upload?: FileObjectMetadata,
  ): string {
    const { endpoint, bucket, ...credentials } = this.configuration;
    const url = new URL(endpoint);
    url.pathname = `/${encodePath(bucket)}/${encodePath(key)}`;
    return presignS3Url({
      ...credentials,
      method,
      url,
      signedAt: this.clock.now(),
      expiresInSeconds,
      upload,
    }).toString();
  }
}

// The payload stays unsigned because the browser sends the bytes directly.
export function presignS3Url(request: PresignRequest): URL {
  const amzDate = request.signedAt.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${request.region}/s3/aws4_request`;
  const headers: [string, string][] = request.upload
    ? [
        ['content-length', String(request.upload.sizeBytes)],
        ['content-type', request.upload.contentType],
        ['host', request.url.host],
      ]
    : [['host', request.url.host]];
  const signedHeaders = headers.map(([name]) => name).join(';');
  const parameters: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${request.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(request.expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];
  const query = parameters.map(([name, value]) => `${name}=${encodeRfc3986(value)}`).join('&');
  const canonicalRequest = [
    request.method,
    request.url.pathname,
    query,
    headers.map(([name, value]) => `${name}:${value.trim()}\n`).join(''),
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  let signingKey: Buffer = Buffer.from(`AWS4${request.secretAccessKey}`);
  for (const part of [date, request.region, 's3', 'aws4_request']) {
    signingKey = createHmac('sha256', signingKey).update(part).digest();
  }
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const url = new URL(request.url);
  url.search = `${query}&X-Amz-Signature=${signature}`;
  return url;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeRfc3986).join('/');
}

// S3 signs RFC 3986 encoding, which also escapes the characters encodeURIComponent leaves.
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
