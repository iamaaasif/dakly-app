import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignsRepository } from './campaigns.repository';

describe('campaign recipient purge (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  const repository = new CampaignsRepository(fixture.tenant);
  const contactId = randomUUID();
  const otherContactId = randomUUID();
  const count = async (storeId: string) =>
    (
      await owner.query(
        'select count(*)::int as total from campaign_recipients where store_id = $1',
        [storeId],
      )
    ).rows[0].total as number;

  async function addCampaign(storeId: string, finishedDaysAgo: number | null) {
    const id = randomUUID();
    await owner.query(
      `insert into campaigns (id, store_id, name, channel, category, content, status, finished_at)
       values ($1, $2, 'ঈদ অফার', 'sms', 'marketing', '{}', 'sent',
         case when $3::int is null then null else now() - make_interval(days => $3::int) end)`,
      [id, storeId, finishedDaysAgo],
    );
    await owner.query(
      `insert into campaign_recipients (id, store_id, campaign_id, contact_id, status)
       values ($1, $2, $3, $4, 'sent')`,
      [randomUUID(), storeId, id, storeId === fixture.a ? contactId : otherContactId],
    );
  }

  beforeAll(async () => {
    await fixture.setup();
    for (const [id, storeId] of [
      [contactId, fixture.a],
      [otherContactId, fixture.b],
    ])
      await owner.query(
        "insert into contacts (id, store_id, source, kind) values ($1, $2, 'manual', 'customer')",
        [id, storeId],
      );
    await addCampaign(fixture.a, 400);
    await addCampaign(fixture.a, 100);
    await addCampaign(fixture.a, null);
    await addCampaign(fixture.b, 400);
  });
  afterAll(async () => {
    await owner.query('delete from campaign_recipients where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from contacts where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.close();
  });

  it('deletes recipients 372 days after their campaign finished, not earlier or while it runs', async () => {
    expect(await repository.purgeExpiredRecipientsBatch(fixture.a, 1)).toBe(true);
    expect(await count(fixture.a)).toBe(2);
    expect(await repository.purgeExpiredRecipientsBatch(fixture.a, 5)).toBe(false);
    expect(await count(fixture.a)).toBe(2);
    expect(await count(fixture.b)).toBe(1);
  });
});
