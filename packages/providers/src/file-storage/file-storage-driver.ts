// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
export type FileObjectMetadata = { contentType: string; sizeBytes: number };
export type FileStorageDriver = {
  createUploadUrl(key: string, expiresInSeconds: number, upload?: FileObjectMetadata): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
  getObjectMetadata(key: string): Promise<FileObjectMetadata | null>;
  readBytes(key: string, maxBytes: number): Promise<StoredFile>;
  writeText(key: string, body: string, contentType: string): Promise<void>;
};

export type StoredFile =
  { kind: 'found'; bytes: Uint8Array } | { kind: 'missing' } | { kind: 'too_large' };
