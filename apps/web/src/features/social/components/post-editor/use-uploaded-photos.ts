import { useState } from 'react';

import type { UploadedPostPhoto } from '../../api/upload-post-photo';

// Photos uploaded from the device in this session; the preview and the photo list both read them.
export function useUploadedPhotos() {
  const [photos, setPhotos] = useState<UploadedPostPhoto[]>([]);
  return { photos, add: (photo: UploadedPostPhoto) => setPhotos((list) => [...list, photo]) };
}

export type UploadedPhotos = ReturnType<typeof useUploadedPhotos>;
