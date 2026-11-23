import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { prepareKhataPhoto } from './khata-photo';

// 200 wide, 100 tall, left half black, right half white: orientation shows in the pixels.
async function sample(orientation?: number) {
  const half = (color: string) => ({
    create: { width: 100, height: 100, channels: 3 as const, background: color },
  });
  const wide = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#000' } })
    .composite([{ input: await sharp(half('#fff')).png().toBuffer(), left: 100, top: 0 }])
    .jpeg()
    .toBuffer();
  return orientation ? sharp(wide).withMetadata({ orientation }).jpeg().toBuffer() : wide;
}

async function size(bytes: Uint8Array) {
  const { width, height } = await sharp(bytes).metadata();
  return [width, height];
}

describe('prepareKhataPhoto', () => {
  it('stands a photo with an EXIF turn flag upright', async () => {
    const photo = await prepareKhataPhoto(await sample(6));
    expect(photo?.contentType).toBe('image/jpeg');
    expect(await size(photo!.bytes)).toEqual([100, 200]);
  });

  it('leaves an upright photo as it is', async () => {
    expect(await size((await prepareKhataPhoto(await sample()))!.bytes)).toEqual([200, 100]);
  });

  it('turns by the angle the model asked for after the EXIF flag', async () => {
    expect(await size((await prepareKhataPhoto(await sample(), 90))!.bytes)).toEqual([100, 200]);
    expect(await size((await prepareKhataPhoto(await sample(6), 90))!.bytes)).toEqual([200, 100]);
  });

  it('shrinks a very large photo to a readable size', async () => {
    const big = await sharp({
      create: { width: 5000, height: 3000, channels: 3, background: '#888' },
    })
      .jpeg()
      .toBuffer();
    expect(await size((await prepareKhataPhoto(big))!.bytes)).toEqual([2600, 1560]);
  });

  it('gives nothing for bytes that are not an image', async () => {
    expect(await prepareKhataPhoto(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
