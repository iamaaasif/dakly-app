import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { OrderAttributionRepository } from './order-attribution.repository';
import { OrderAttributionService } from './order-attribution.service';

const orderAt = new Date('2026-11-19T06:00:00Z');
const attribution = {
  touchId: randomUUID(),
  touchAt: new Date('2026-11-17T06:00:00Z'),
  sourceType: 'campaign',
  sourceId: randomUUID(),
  channel: 'sms',
  windowDays: 7,
} as const;

describe('OrderAttributionService', () => {
  const fixture = new OwnerIsolationFixture();
  const transaction = new StoreTransaction(fixture.tenant);
  const clock = new Clock();
  vi.spyOn(clock, 'now').mockReturnValue(orderAt);
  const outbox = new OutboxService(
    new OutboxRepository(fixture.connection.db, fixture.tenant),
    transaction,
  );
  const service = new OrderAttributionService(
    new OrderAttributionRepository(fixture.tenant),
    transaction,
    outbox,
    clock,
  );
  let number = 1000;

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    const stores = [[fixture.a, fixture.b]];
    await fixture.connection.pool.query(
      'delete from orders where store_id=any($1::uuid[])',
      stores,
    );
    await fixture.connection.pool.query(
      'delete from outbox_events where store_id=any($1::uuid[])',
      stores,
    );
    await fixture.close();
  });

  async function order(storeId: string) {
    const orderId = randomUUID();
    const buyerId = randomUUID();
    await fixture.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [buyerId, storeId],
    );
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,
        recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        order_discount_poisha,delivery_charge_poisha,cod_amount_poisha,created_at,updated_at)
       values ($1,$2,$3,'manual','user',$4,'রিনা','01710000005','Mirpur','Dhaka',125000,5000,6000,126000,$5,$5)`,
      [orderId, storeId, ++number, buyerId, orderAt],
    );
    return orderId;
  }

  async function events(orderId: string) {
    const { rows } = await fixture.connection.pool.query(
      `select store_id,type,payload from outbox_events where payload->>'orderId'=$1 order by id`,
      [orderId],
    );
    return rows;
  }

  it('records the selected touch once without changing the editable order revision', async () => {
    const orderId = await order(fixture.a);
    const selection = { ...attribution, buyer: (await service.find(fixture.a, orderId))! };
    await Promise.all([
      service.record(fixture.a, orderId, selection),
      service.record(fixture.a, orderId, selection),
    ]);
    expect(await fixture.row('orders', orderId)).toMatchObject({
      attributed_touch_id: attribution.touchId,
      attributed_window_days: 7,
      attributed_amount_poisha: 120000,
      attributed_source_type: 'campaign',
      attributed_source_id: attribution.sourceId,
      attributed_channel: 'sms',
      updated_at: '2026-11-19T06:00:00+00:00',
    });
    expect(await events(orderId)).toEqual([
      {
        store_id: fixture.a,
        type: 'attribution.created',
        payload: { orderId, sourceType: 'campaign', sourceId: attribution.sourceId },
      },
    ]);
  });

  it.each([
    { isRecipientBuyer: true, expected: null },
    { isRecipientBuyer: false, expected: attribution.touchId },
  ])(
    'checks an edited delivery phone only on self-delivery ($isRecipientBuyer)',
    async ({ isRecipientBuyer, expected }) => {
      const orderId = await order(fixture.a);
      const db = fixture.connection.pool;
      await db.query('update orders set is_recipient_buyer=$2 where id=$1', [
        orderId,
        isRecipientBuyer,
      ]);
      const buyer = (await service.find(fixture.a, orderId))!;
      await db.query("update orders set recipient_phone='01710000006' where id=$1", [orderId]);
      await service.record(fixture.a, orderId, { ...attribution, buyer });
      expect(await fixture.row('orders', orderId)).toMatchObject({ attributed_touch_id: expected });
    },
  );

  it('keeps the captured amount when a new window selects the same touch', async () => {
    const orderId = await order(fixture.a);
    const buyer = (await service.find(fixture.a, orderId))!;
    await service.record(fixture.a, orderId, { ...attribution, buyer });
    await fixture.connection.pool.query(
      'update orders set items_subtotal_poisha=100000 where id=$1',
      [orderId],
    );
    const reference = { ...attribution, windowDays: 3 } as const;
    await service.rebuild(fixture.a, orderId, buyer, reference);
    await service.rebuild(fixture.a, orderId, buyer, reference);
    expect(await fixture.row('orders', orderId)).toMatchObject({
      attributed_touch_id: attribution.touchId,
      attributed_window_days: 3,
      attributed_amount_poisha: 120000,
    });
    expect((await events(orderId)).map(({ type }) => type)).toEqual(['attribution.created']);
  });

  it('leaves a foreign order untouched and clears a cancelled order only once', async () => {
    const orderId = await order(fixture.b);
    const selection = { ...attribution, buyer: (await service.find(fixture.b, orderId))! };
    await service.record(fixture.a, orderId, selection);
    expect(await fixture.row('orders', orderId)).toMatchObject({ attributed_touch_id: null });
    expect(await events(orderId)).toEqual([]);
    await service.record(fixture.b, orderId, selection);
    await fixture.connection.pool.query(
      "update orders set stage='cancelled',cancel_reason='test' where id=$1",
      [orderId],
    );
    await service.record(fixture.b, orderId, selection);
    await service.clear(fixture.b, orderId);
    await service.record(fixture.b, orderId, selection);
    await service.clear(fixture.b, orderId);
    expect(await fixture.row('orders', orderId)).toMatchObject({
      attributed_touch_id: null,
      attributed_amount_poisha: null,
      attributed_window_days: null,
    });
    expect((await events(orderId)).map(({ type }) => type)).toEqual([
      'attribution.created',
      'attribution.removed',
    ]);
  });
});
