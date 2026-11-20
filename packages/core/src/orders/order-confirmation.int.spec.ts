import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { OrderConfirmationRepository } from './order-confirmation.repository';
import { OrderConfirmationService } from './order-confirmation.service';

describe('order confirmation links (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const service = new OrderConfirmationService(new OrderConfirmationRepository(fixture.tenant));
  const orderA = randomUUID();
  const orderB = randomUUID();

  beforeAll(async () => {
    await fixture.setup();
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,recipient_phone,
         recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha) values
       ($1,$2,1001,'manual','user','রিনা','01710000005','Mirpur','Dhaka',50000,50000),
       ($3,$4,1001,'manual','user','রিনা','01710000005','Mirpur','Dhaka',50000,50000)`,
      [orderA, fixture.a, orderB, fixture.b],
    );
  });
  afterAll(async () => {
    for (const table of ['order_confirmations', 'orders'])
      await fixture.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [fixture.a, fixture.b],
      ]);
    await fixture.close();
  });

  const rows = (orderId: string) =>
    fixture.connection.pool.query('select token_hash from order_confirmations where order_id=$1', [
      orderId,
    ]);
  const tokenOf = (url: string) => url.split('/c/')[1] ?? '';

  it('gives each message its own long token, and keeps only the sha256 of every one', async () => {
    const urls = await Promise.all([
      service.issueUrl(fixture.a, orderA),
      service.issueUrl(fixture.a, orderA),
    ]);
    const later = await service.issueUrl(fixture.a, orderA);
    const stored = (await rows(orderA)).rows.map((row) => row.token_hash as Buffer);
    expect(stored).toHaveLength(3);
    for (const url of [...urls, later]) {
      expect(tokenOf(url)).toMatch(/^[\w-]{43}$/u);
      const hash = createHash('sha256').update(tokenOf(url)).digest();
      expect(stored.some((row) => row.equals(hash))).toBe(true);
    }
  });

  it('refuses an order that belongs to another store', async () => {
    await expect(service.issueUrl(fixture.a, orderB)).rejects.toThrow();
    expect((await rows(orderB)).rows).toEqual([]);
  });
});
