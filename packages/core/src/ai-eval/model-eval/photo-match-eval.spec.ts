import { describe, expect, it } from 'vitest';

import { photoSearchText } from '@dakly/contracts/chats';

import { evalPhotoKey, evalProducts } from './eval-catalog';
import { matchEvalPhoto } from './fixture-tools';

function match(photoText: string) {
  return matchEvalPhoto(photoSearchText(photoText) ?? photoText) as {
    photoMatch: string;
    products: { name: string }[];
    matchedVariantId?: string;
    photoId?: string;
    soldOutVariantId?: string;
    rule: string;
  };
}

describe('photo match over the eval shop', () => {
  it('answers a Bangla photo of a kurti as the kurti, not the red panjabi', () => {
    const result = match(
      'Photo: লাল রঙের কুর্তি, সাদা ফুলের নকশা\nSearch words: লাল, কুর্তি, red, kurti',
    );
    expect(result.photoMatch).toBe('sure');
    expect(result.products.map(({ name }) => name)).toEqual(['কুর্তি']);
  });

  it('answers a mixed Bangla and Banglish photo of a kurti as the kurti', () => {
    const result = match('Photo: লাল kurti, fuler noksha\nSearch words: lal, কুর্তি. eta koto?');
    expect(result.photoMatch).toBe('sure');
    expect(result.products.map(({ name }) => name)).toEqual(['কুর্তি']);
  });

  it('answers an English photo of canvas shoes as that product', () => {
    const result = match('photo: white canvas shoes, lace-up, rubber sole. How much?');
    expect(result.photoMatch).toBe('sure');
    expect(result.products.map(({ name }) => name)).toEqual(['ক্যানভাস জুতা']);
  });

  it('says a photo of a product with no stock is sold out and offers nothing else', () => {
    const result = match('photo: brown leather shoes, loafer, kalo sole. eta koto?');
    expect(result.photoMatch).toBe('sold_out');
    expect(result.products.map(({ name }) => name)).toEqual(['লোফার']);
  });

  it('asks when the photo only names a group of products', () => {
    const result = match('Photo: a woman wearing a long red dress');
    expect(result.photoMatch).not.toBe('sure');
  });

  it('gives no match for a photo of something the shop does not sell', () => {
    expect(match('Photo: a laptop on a desk').photoMatch).toBe('none');
  });

  it('never lists a sold-out product as a choice', () => {
    const result = match('Photo: shoes');
    expect(result.products.map(({ name }) => name)).not.toContain('লোফার');
    expect(result.products.map(({ name }) => name)).not.toContain('স্নিকার্স');
  });
});

describe('photo colour match', () => {
  const bag = evalProducts.find(({ name }) => name === 'হ্যান্ডব্যাগ')!;
  const variantTitle = (id: string | undefined) =>
    bag.variants.find(({ variantId }) => variantId === id)?.title;

  it('finds the red variant and its photo from a Bangla photo', () => {
    const result = match('Photo: লাল চামড়ার হ্যান্ডব্যাগ, সোনালি ক্ল্যাপ');
    expect(result.photoMatch).toBe('sure');
    expect(evalPhotoKey(result.photoId)).toBe('bag-red');
    expect(variantTitle(result.matchedVariantId)).toBe('লাল');
  });

  it('finds the blue variant from Banglish "nil"', () => {
    const result = match('photo: nil handbag, lomba strap. eta koto?');
    expect(evalPhotoKey(result.photoId)).toBe('bag-blue');
    expect(variantTitle(result.matchedVariantId)).toBe('নীল');
  });

  it('never offers the black variant that has no stock', () => {
    const result = match('photo: kalo handbag, gold clasp. এটা ache?');
    expect(variantTitle(result.soldOutVariantId)).toBe('কালো');
    expect(result.matchedVariantId).toBeUndefined();
    expect(result.photoId).toBeUndefined();
  });

  it('sends no photo for a colour the shop has no photo of', () => {
    const result = match('ছবি: sobuj handbag');
    expect(result.photoMatch).toBe('sure');
    expect(result.photoId).toBeUndefined();
    expect(result.rule).toContain('withoutPhoto');
  });

  it('keeps a product with no colour-tagged photos as before', () => {
    const result = match('photo: white canvas shoes, lace-up, rubber sole');
    expect(result.photoId).toBeUndefined();
  });
});

describe('photoSearchText', () => {
  it('drops the label and the field names', () => {
    expect(photoSearchText('Photo: red kurti\nSearch words: red, kurti\nText in photo: Rupa')).toBe(
      'red kurti\nred, kurti\nRupa',
    );
  });

  it('ignores a payment screenshot and ordinary text', () => {
    expect(photoSearchText('Payment screenshot: bKash 500')).toBeUndefined();
    expect(photoSearchText('kurti ache?')).toBeUndefined();
  });
});
