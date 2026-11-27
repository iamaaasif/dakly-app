// Photos are shrunk in the browser so a phone photo uploads fast and stays under the 5 MB limit.
const MAX_PHOTO_EDGE = 2000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function fitWithin(width: number, height: number, edge = MAX_PHOTO_EDGE) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function shrinkPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const size = fitWithin(bitmap.width, bitmap.height);
  const resized = size.width !== bitmap.width;
  if (!resized && file.size <= MAX_PHOTO_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.9),
  );
  // A browser without WebP encoding returns PNG; that is fine unless it is still too big.
  if (!blob || blob.size > MAX_PHOTO_BYTES) return file;
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
  return new File([blob], file.name.replace(/\.\w+$/, `.${type.slice(6)}`), { type });
}
