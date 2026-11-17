// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
export type FileStorageDriver = {
  createUploadUrl(key: string, expiresInSeconds: number): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
};
