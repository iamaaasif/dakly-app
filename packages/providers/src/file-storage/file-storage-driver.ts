// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
// The API reads and writes a file itself only when it processes it, such as an import.
export type FileStorageDriver = {
  // The upload must carry exactly this length and type, so the browser cannot send another file.
  createUploadUrl(key: string, expiresInSeconds: number, content: UploadContent): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
  readText(key: string, maxBytes: number): Promise<StoredText>;
  writeText(key: string, body: string, contentType: string): Promise<void>;
};

export type StoredText =
  { kind: 'found'; text: string } | { kind: 'missing' } | { kind: 'too_large' };

export type UploadContent = { contentLength: number; contentType: string };
