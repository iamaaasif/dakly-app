import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { ContactsService } from '../contacts/contacts.service';
import type { MessagingService } from '../messaging/messaging.service';
import { TenantDatabase } from '../platform/database/tenant-database';
import { RestockRequestsRepository } from './restock-requests.repository';
import { RestockRequestsService } from './restock-requests.service';

const now = new Date('2026-11-21T08:00:00Z');

describe('RestockRequestsService', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const unreachable = new Set<string>();
  const queued: { operationKey: string; contactId: string; content: string }[] = [];
  const contacts = {
    findRecipient: async (storeId: string, id: string) =>
      (
        await f.connection.pool.query('select 1 from contacts where store_id=$1 and id=$2', [
          storeId,
          id,
        ])
      ).rowCount
        ? { id }
        : undefined,
  } as unknown as ContactsService;
  const messaging = {
    latestChatRoute: async (_storeId: string, contactId: string) =>
      unreachable.has(contactId)
        ? undefined
        : { connectionId: randomUUID(), identityId: randomUUID() },
    queueChannelMessage: async (
      _storeId: string,
      message: { operationKey: string; contactId: string; content: string },
    ) => {
      queued.push(message);
      return { messageId: randomUUID() };
    },
  } as unknown as MessagingService;
  const service = new RestockRequestsService(
    new RestockRequestsRepository(tenant),
    contacts,
    messaging,
    { now: () => now },
  );
  const staff = { kind: 'user', userId: f.userA } as const;

  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['restock_requests', 'product_variants', 'products', 'contacts'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.pool.end();
    await f.close();
  });

  async function variant(onHand: number, storeId = f.a) {
    const productId = randomUUID(),
      id = randomUUID();
    await f.connection.pool.query(
      "insert into products(id,store_id,name,is_stock_tracked) values($1,$2,'কটন পাঞ্জাবি',true)",
      [productId, storeId],
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand,is_default) values($1,$2,$3,'XL',$4,true)",
      [id, storeId, productId, onHand],
    );
    return { id, productId };
  }
  async function contact(storeId = f.a) {
    const id = randomUUID();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','lead')",
      [id, storeId],
    );
    return id;
  }
  async function stockIn(variantId: string, onHand: number) {
    await f.connection.pool.query('update product_variants set on_hand=$2 where id=$1', [
      variantId,
      onHand,
    ]);
  }

  it('keeps one waiting row when the same person asks twice', async () => {
    const { id } = await variant(0);
    const contactId = await contact();
    const first = await service.addToWaitingList(f.a, id, { contactId });
    const second = await service.addToWaitingList(f.a, id, { contactId });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ status: 'waiting', variantId: id, contactId });
    expect(await service.waitingByProduct(f.a, (await sizeOf(id)).productId)).toEqual({
      items: [{ variantId: id, waiting: 1 }],
    });
  });
  async function sizeOf(variantId: string) {
    const row = await f.connection.pool.query(
      'select product_id from product_variants where id=$1',
      [variantId],
    );
    return { productId: row.rows[0].product_id as string };
  }

  it('refuses a size that is in stock, a missing contact and another shop variant', async () => {
    const inStock = await variant(3);
    const soldOut = await variant(0);
    const other = await variant(0, f.b);
    const contactId = await contact();
    await expect(service.addToWaitingList(f.a, inStock.id, { contactId })).rejects.toMatchObject({
      code: 'RESTOCK_VARIANT_IN_STOCK',
    });
    await expect(
      service.addToWaitingList(f.a, soldOut.id, { contactId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'RESTOCK_CONTACT_NOT_FOUND' });
    await expect(service.addToWaitingList(f.a, other.id, { contactId })).rejects.toMatchObject({
      code: 'PRODUCT_VARIANT_NOT_FOUND',
    });
  });

  it('does not show one shop the other shop waiting list', async () => {
    const { id } = await variant(0, f.b);
    const contactId = await contact(f.b);
    const added = await service.addToWaitingList(f.b, id, { contactId });
    expect((await service.list(f.a, { limit: 100, status: 'waiting' })).items).not.toContainEqual(
      expect.objectContaining({ id: added.id }),
    );
    await expect(service.cancel(f.a, added.id)).rejects.toMatchObject({
      code: 'RESTOCK_REQUEST_NOT_FOUND',
    });
  });

  it('queues a message for each reachable person after restock and leaves the rest waiting', async () => {
    const { id } = await variant(0);
    const reachable = await contact();
    const noChat = await contact();
    unreachable.add(noChat);
    await service.addToWaitingList(f.a, id, { contactId: reachable });
    await service.addToWaitingList(f.a, id, { contactId: noChat });
    await expect(service.notifyWaiting(f.a, id, staff)).rejects.toMatchObject({
      code: 'RESTOCK_VARIANT_STILL_OUT',
    });
    await stockIn(id, 5);
    queued.length = 0;
    expect(await service.notifyWaiting(f.a, id, staff)).toEqual({ queued: 1, waiting: 1 });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ contactId: reachable });
    expect(queued[0]!.content).toContain('কটন পাঞ্জাবি (XL)');
    const notified = await service.list(f.a, { variantId: id, limit: 50, status: 'notified' });
    expect(notified.items).toEqual([
      expect.objectContaining({ contactId: reachable, notifiedAt: now.toISOString() }),
    ]);
    // Approving again must not message the person who was already told.
    expect(await service.notifyWaiting(f.a, id, staff)).toEqual({ queued: 0, waiting: 1 });
    expect(queued).toHaveLength(1);
  });

  it('keeps a request waiting when queuing its message fails, so a retry sends it', async () => {
    const { id } = await variant(4);
    const contactId = await contact();
    await f.connection.pool.query(
      'insert into restock_requests(id,store_id,variant_id,contact_id) values($1,$2,$3,$4)',
      [randomUUID(), f.a, id, contactId],
    );
    const failing = new RestockRequestsService(
      new RestockRequestsRepository(tenant),
      contacts,
      {
        latestChatRoute: messaging.latestChatRoute.bind(messaging),
        queueChannelMessage: async () => {
          throw new Error('queue down');
        },
      } as unknown as MessagingService,
      { now: () => now },
    );
    await expect(failing.notifyWaiting(f.a, id, staff)).rejects.toThrow('queue down');
    expect(await service.notifyWaiting(f.a, id, staff)).toEqual({ queued: 1, waiting: 0 });
  });

  it('cancels a waiting request once and hides it from the waiting list', async () => {
    const { id } = await variant(0);
    const contactId = await contact();
    const { id: requestId } = await service.addToWaitingList(f.a, id, { contactId });
    await service.cancel(f.a, requestId);
    await expect(service.cancel(f.a, requestId)).rejects.toMatchObject({
      code: 'RESTOCK_REQUEST_NOT_FOUND',
    });
    expect(
      (await service.list(f.a, { variantId: id, limit: 50, status: 'waiting' })).items,
    ).toEqual([]);
    // A person who cancelled can ask again.
    const again = await service.addToWaitingList(f.a, id, { contactId });
    expect(again.id).not.toBe(requestId);
  });

  it('pages the list with a cursor', async () => {
    const { id } = await variant(0);
    for (let i = 0; i < 3; i++)
      await service.addToWaitingList(f.a, id, { contactId: await contact() });
    const first = await service.list(f.a, { variantId: id, limit: 2, status: 'waiting' });
    expect(first.items).toHaveLength(2);
    const second = await service.list(f.a, {
      variantId: id,
      limit: 2,
      status: 'waiting',
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});
