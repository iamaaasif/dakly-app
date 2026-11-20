// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
export type FileObjectMetadata = { contentType: string; sizeBytes: number };
export type ListedObject = { key: string; lastModified: Date };
export type ObjectPage = { objects: ListedObject[]; nextToken: string | null };
export type FileStorageDriver = {
  createUploadUrl(key: string, expiresInSeconds: number, upload?: FileObjectMetadata): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
  getObjectMetadata(key: string): Promise<FileObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  // One page of the keys under a prefix; pass the previous page's nextToken for the next one.
  listObjects(prefix: string, token?: string): Promise<ObjectPage>;
  readBytes(key: string, maxBytes: number): Promise<StoredFile>;
  writeText(key: string, body: string, contentType: string): Promise<void>;
  writeBytes(key: string, body: Uint8Array, contentType: string): Promise<void>;
};

export type StoredFile =
  { kind: 'found'; bytes: Uint8Array } | { kind: 'missing' } | { kind: 'too_large' };
