import { createHash, createHmac } from 'node:crypto';

import type { FileStorageDriver, StoredText, UploadContent } from '../file-storage-driver';

export type S3Configuration = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// The server's own reads and writes sign a URL for one request only.
const REQUEST_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 60_000;

type PresignRequest = {
  method: 'GET' | 'PUT';
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  signedAt: Date;
  expiresInSeconds: number;
  // Lower-case names. Host is always signed.
  headers?: Record<string, string>;
};

// Plain S3 with path-style URLs, so the same driver serves Cloudflare R2 and the local stand-in.
export class S3FileStorageDriver implements FileStorageDriver {
  constructor(
    private readonly configuration: S3Configuration,
    private readonly clock: { now(): Date },
  ) {}

  createUploadUrl(key: string, expiresInSeconds: number, content: UploadContent): string {
    return this.presign('PUT', key, expiresInSeconds, {
      'content-length': String(content.contentLength),
      'content-type': content.contentType,
    });
  }

  createDownloadUrl(key: string, expiresInSeconds: number): string {
    return this.presign('GET', key, expiresInSeconds);
  }

  // Counts the bytes as they arrive, so a file over the limit is never held in memory.
  async readText(key: string, maxBytes: number): Promise<StoredText> {
    const response = await fetch(this.presign('GET', key, REQUEST_SECONDS), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) return { kind: 'missing' };
    if (!response.ok || !response.body)
      throw new Error(`File storage read failed with ${response.status}`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxBytes) return { kind: 'too_large' };
      chunks.push(chunk);
    }
    return { kind: 'found', text: Buffer.concat(chunks).toString('utf8') };
  }

  async writeText(key: string, body: string, contentType: string): Promise<void> {
    const content = { contentLength: Buffer.byteLength(body), contentType };
    const response = await fetch(this.createUploadUrl(key, REQUEST_SECONDS, content), {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`File storage write failed with ${response.status}`);
  }

  private presign(
    method: 'GET' | 'PUT',
    key: string,
    expiresInSeconds: number,
    headers: Record<string, string> = {},
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
      headers,
    }).toString();
  }
}

// AWS Signature Version 4 in the query string. The payload is unsigned, so the URL works for any body.
export function presignS3Url(request: PresignRequest): URL {
  const amzDate = request.signedAt.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${request.region}/s3/aws4_request`;
  const headers: Record<string, string> = { ...request.headers, host: request.url.host };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
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
    names.map((name) => `${name}:${headers[name]}\n`).join(''),
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
