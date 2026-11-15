import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoresRepository } from './stores.repository';

describe('store filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new StoresRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('selects and changes only the requested store', async () => {
    expect(await repository.find(f.a)).toMatchObject({ id: f.a });
    expect(await repository.settings(f.b)).toMatchObject({ id: f.b });
    const before = await f.row('stores', f.a);
    expect(await repository.changeSettings(f.b, { name: 'নতুন দোকান' }, new Date())).toMatchObject({
      id: f.b,
      name: 'নতুন দোকান',
    });
    expect(await repository.changeExtensions(f.b, ['chats'], new Date())).toMatchObject({
      id: f.b,
      extensions: ['chats'],
    });
    expect(await f.row('stores', f.a)).toEqual(before);
  });
});
