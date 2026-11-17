// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
// The API reads and writes a file itself only when it processes it, such as an import.
export type FileStorageDriver = {
  createUploadUrl(key: string, expiresInSeconds: number): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
  readText(key: string, maxBytes: number): Promise<StoredText>;
  writeText(key: string, body: string, contentType: string): Promise<void>;
};

export type StoredText =
  { kind: 'found'; text: string } | { kind: 'missing' } | { kind: 'too_large' };
