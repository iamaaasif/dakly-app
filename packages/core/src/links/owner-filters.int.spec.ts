import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { LinksRepository } from './links.repository';

const visit = () => ({
  eventKey: randomUUID(),
  occurredAt: new Date(),
  visitorHash: Buffer.alloc(32, 7),
});

describe('tracked link filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new LinksRepository(f.tenant, f.connection.db);
  const contactA = randomUUID();
  const contactB = randomUUID();
  const link = (contactId: string, kind: 'redirect' | 'sms_opt_out') => ({
    id: randomUUID(),
    code: randomUUID().replaceAll('-', '').slice(0, 8),
    kind,
    targetUrl: kind === 'redirect' ? 'https://karimer-dokan.example.test' : null,
    sourceType: 'campaign' as const,
    sourceId: randomUUID(),
    contactId,
  });
  beforeAll(async () => {
    await f.setup();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer'),($3,$4,'করিম','manual','customer')",
      [contactA, f.a, contactB, f.b],
    );
  });
  afterAll(() => f.close());

  it('inserts into the selected store and taps only its own links', async () => {
    const redirectA = link(contactA, 'redirect');
    const optOutA = link(contactA, 'sms_opt_out');
    expect(await repository.insert(f.a, [redirectA, optOutA])).toEqual([redirectA.id, optOutA.id]);

    expect((await f.row('tracked_links', redirectA.id)).store_id).toBe(f.a);
    expect(await repository.recordRedirectTap(f.b, redirectA.id, visit())).toBeUndefined();
    expect(await repository.lockOptOutLink(f.b, optOutA.id)).toBeUndefined();
    expect((await f.row('tracked_links', redirectA.id)).tap_count).toBe(0);
    expect(await repository.recordRedirectTap(f.a, redirectA.id, visit())).toEqual(
      expect.objectContaining({ tapCount: 1, contactId: contactA }),
    );
    expect(await repository.lockOptOutLink(f.a, optOutA.id)).toEqual(
      expect.objectContaining({ contactId: contactA }),
    );
  });

  it('skips a code another store already holds', async () => {
    const taken = link(contactB, 'redirect');
    await repository.insert(f.b, [taken]);

    expect(
      await repository.insert(f.a, [{ ...link(contactA, 'redirect'), code: taken.code }]),
    ).toEqual([]);
    expect(await repository.locate(taken.code)).toEqual({ storeId: f.b, trackedLinkId: taken.id });
  });
});
