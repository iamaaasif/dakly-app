import sharp from 'sharp';

// Large enough to read small handwriting, small enough for the model to take.
const LONG_SIDE_PIXELS = 2600;

export type KhataPhoto = { contentType: 'image/jpeg'; bytes: Uint8Array };

// Phones store a sideways photo as upright pixels plus an EXIF turn flag, which the model never
// sees. Applying the flag, plus any turn the model asked for, gives it a page it can read.
// Undefined when the bytes are not an image that can be decoded.
export async function prepareKhataPhoto(
  bytes: Uint8Array,
  extraTurnClockwiseDegrees: 0 | 90 | 180 | 270 = 0,
): Promise<KhataPhoto | undefined> {
  try {
    const upright = await sharp(bytes).rotate().toBuffer();
    const turned = await sharp(upright)
      .rotate(extraTurnClockwiseDegrees)
      .resize({
        width: LONG_SIDE_PIXELS,
        height: LONG_SIDE_PIXELS,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { contentType: 'image/jpeg', bytes: new Uint8Array(turned) };
  } catch {
    return undefined;
  }
}
