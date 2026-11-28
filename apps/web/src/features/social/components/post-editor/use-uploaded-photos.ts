import { useState } from 'react';

import type { UploadedPostPhoto } from '../../api/upload-post-photo';

// Photos uploaded from the device in this session, plus those a saved draft already has;
// the preview and the photo list both read them.
export function useUploadedPhotos(saved: UploadedPostPhoto[] = []) {
  const [photos, setPhotos] = useState<UploadedPostPhoto[]>(saved);
  return { photos, add: (photo: UploadedPostPhoto) => setPhotos((list) => [...list, photo]) };
}

export type UploadedPhotos = ReturnType<typeof useUploadedPhotos>;
