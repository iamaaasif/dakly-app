// Presigned URLs let the browser send and fetch files directly, so the API never streams them.
export type FileStorageDriver = {
  // The upload must carry exactly this length and type, so the browser cannot send another file.
  createUploadUrl(key: string, expiresInSeconds: number, content: UploadContent): string;
  createDownloadUrl(key: string, expiresInSeconds: number): string;
};

export type UploadContent = { contentLength: number; contentType: string };
