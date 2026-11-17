// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
// The API reads and writes a file itself only when it processes it, such as an import.
export type FileStorageDriver = {
  // The upload must carry exactly this length and type, so the browser cannot send another file.
  createUploadUrl(key: string, expiresInSeconds: number, content: UploadContent): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
  readBytes(key: string, maxBytes: number): Promise<StoredFile>;
  writeText(key: string, body: string, contentType: string): Promise<void>;
};

export type StoredFile =
  { kind: 'found'; bytes: Uint8Array } | { kind: 'missing' } | { kind: 'too_large' };

export type UploadContent = { contentLength: number; contentType: string };
