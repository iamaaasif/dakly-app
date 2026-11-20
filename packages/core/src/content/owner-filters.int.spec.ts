import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ContentRepository } from './content.repository';

describe('content filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new ContentRepository(f.tenant);
  const now = new Date('2026-11-19T06:00:00Z');

  beforeAll(() => f.setup());
  afterAll(async () => {
    try {
      await f.connection.pool.query('delete from content_pieces where store_id = any($1::uuid[])', [
        [f.a, f.b],
      ]);
      await f.connection.pool.query('delete from brand_profiles where store_id = any($1::uuid[])', [
        [f.a, f.b],
      ]);
    } finally {
      await f.close();
    }
  });

  it('reads and updates the selected store profile', async () => {
    const first = {
      voice: 'সহজ',
      audience: null,
      preferredWords: [],
      wordsToAvoid: [],
      callToActionBn: null,
      callToActionEn: null,
    };
    await repository.saveBrandProfile(f.a, first, f.userA, now);
    expect(await repository.findBrandProfile(f.b)).toBeUndefined();
    const second = { ...first, voice: 'বন্ধুসুলভ' };
    await repository.saveBrandProfile(f.b, second, f.userB, now);
    expect(await repository.findBrandProfile(f.a)).toEqual(first);
    expect(await repository.findBrandProfile(f.b)).toEqual(second);
  });

  it('blocks reads and changes to other stores’ library pieces', async () => {
    const input = { kind: 'sms', language: 'bn', body: 'অর্ডার করুন' } as const;
    const first = await repository.createPiece(f.a, input, f.userA, now);
    const second = await repository.createPiece(f.b, input, f.userB, now);
    expect((await repository.listPieces(f.b, { limit: 50 })).map((piece) => piece.id)).toEqual([
      second.id,
    ]);
    expect(await repository.findPiece(f.b, first.id)).toBeUndefined();
    expect(await repository.updatePiece(f.b, first.id, { body: 'নতুন লেখা' }, now)).toBeUndefined();
    expect(await repository.deletePiece(f.b, first.id)).toBe(false);
    expect(await repository.findPiece(f.a, first.id)).toMatchObject(input);
  });
});
