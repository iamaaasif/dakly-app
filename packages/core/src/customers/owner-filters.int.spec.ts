import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CustomersRepository } from './customers.repository';

describe('customer filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new CustomersRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('inserts into the selected store and finds only its customers', async () => {
    const a = await repository.insert(f.a, { name: 'রিনা', phone: '01711000001' });
    const b = await repository.insert(f.b, { name: 'করিম', phone: '01711000001' });
    expect((await f.row('customers', b!.id)).store_id).toBe(f.b);
    expect(await repository.findById(f.a, a!.id)).toMatchObject({ name: 'রিনা' });
    expect(await repository.findById(f.b, b!.id)).toMatchObject({ name: 'করিম' });
    expect(await repository.findById(f.b, a!.id)).toBeUndefined();
  });
});
