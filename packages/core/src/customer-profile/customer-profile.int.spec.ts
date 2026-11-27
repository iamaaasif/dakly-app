import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CustomerProfilePageQuery } from '@dakly/contracts/customer-profile';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DatabaseModule } from '../platform/database/database.module';
import { ContactNotesRepository } from './contact-notes.repository';
import { CustomerProfileModule } from './customer-profile.module';
import { CustomerProfileService } from './customer-profile.service';

class TestModule {}
Module({ imports: [DatabaseModule, CustomerProfileModule] })(TestModule);

const fullAccess = { seeFullPhone: true };
const maskedAccess = { seeFullPhone: false };
const firstPage = (limit = 20): CustomerProfilePageQuery => ({ limit });

describe('Customer profile (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const contactId = randomUUID();
  const otherContactId = randomUUID();
  const strangerId = randomUUID();
  let app: INestApplicationContext;
  let service: CustomerProfileService;

  function sql(text: string, values: unknown[] = []) {
    return fixture.connection.pool.query(text, values);
  }

  async function order(
    number: number,
    createdAt: string,
    {
      buyer = contactId,
      stage = 'to_confirm',
      subtotal = 100000,
      delivered = null,
    }: {
      buyer?: string;
      stage?: string;
      subtotal?: number;
      delivered?: number | null;
    } = {},
  ) {
    const id = randomUUID();
    await sql(
      `insert into orders(id,store_id,number,buyer_contact_id,source,created_by_type,stage,
         recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
         delivered_items_subtotal_poisha,order_discount_poisha,delivery_charge_poisha,cod_amount_poisha,
         created_at,delivered_at,cancelled_at,cancel_reason)
       values ($1,$2,$3,$4,'messenger','user',$5,'রিনা','01710000005','Mirpur','Dhaka',$6,$7,5000,6000,0,$8,
         case when $5 = 'delivered' then $8::timestamptz + interval '2 days' end,
         case when $5 = 'cancelled' then $8::timestamptz + interval '1 day' end,
         case when $5 = 'cancelled' then 'other' end)`,
      [id, fixture.a, number, buyer, stage, subtotal, delivered, createdAt],
    );
    return id;
  }

  async function addLine(orderId: string, variantId: string, name: string, position: number) {
    await sql(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
         unit_price_poisha,is_stock_tracked,created_at)
       values ($1,$2,$3,$4,$5,'লাল',1,50000,false,now() + ($6 || ' seconds')::interval)`,
      [randomUUID(), fixture.a, orderId, variantId, name, String(position)],
    );
  }

  async function campaignMessage(name: string, channel: string, times: Record<string, string>) {
    const campaignId = randomUUID();
    const recipientId = randomUUID();
    await sql(
      "insert into campaigns(id,store_id,name,channel,content,status) values($1,$2,$3,$4,'{}','sent')",
      [campaignId, fixture.a, name, channel],
    );
    await sql(
      `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,read_at,tapped_at,failed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        recipientId,
        fixture.a,
        campaignId,
        contactId,
        times.status,
        times.sent ?? null,
        times.delivered ?? null,
        times.read ?? null,
        times.tapped ?? null,
        times.failed ?? null,
      ],
    );
    return recipientId;
  }

  async function walk(
    read: (
      query: CustomerProfilePageQuery,
    ) => Promise<{ items: { id: string }[]; nextCursor: string | null }>,
    limit: number,
  ) {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await read({ limit, cursor });
      ids.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    return ids;
  }

  beforeAll(async () => {
    await fixture.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(CustomerProfileService);
    await sql(
      `insert into contacts(id,store_id,name,phone,whatsapp_phone,email,address,district,source,kind) values
         ($1,$2,'রিনা','01710000005','01710000006','rina@example.test','Mirpur','Dhaka','messenger','customer'),
         ($3,$2,'করিম','01710000007',null,null,null,null,'manual','customer'),
         ($4,$5,'অন্য দোকান','01710000008',null,null,null,null,'manual','customer')`,
      [contactId, fixture.a, otherContactId, strangerId, fixture.b],
    );
    await sql(
      `insert into contact_stats(contact_id,store_id,orders_count,delivered_count,net_spend_poisha,
         first_order_at,last_order_at,favourite_category,lifecycle_stage)
       values ($1,$2,3,2,300000,'2026-10-01T04:00:00Z','2026-11-09T04:00:00Z','শাড়ি','regulars')`,
      [contactId, fixture.a],
    );
  });

  afterAll(async () => {
    await app?.close();
    for (const table of [
      'automation_runs',
      'automation_versions',
      'automations',
      'campaign_recipients',
      'campaigns',
      'orders',
      'order_items',
      'product_variants',
      'products',
      'files',
      'consents',
      'contact_notes',
      'contact_stats',
      'contacts',
    ]) {
      await sql(`delete from ${table} where store_id=any($1::uuid[])`, [[fixture.a, fixture.b]]);
    }
    await fixture.close();
  });

  it('reads the summary with the stats the profile header shows', async () => {
    expect(await service.summary(fixture.a, contactId, fullAccess)).toMatchObject({
      name: 'রিনা',
      phone: '01710000005',
      whatsappPhone: '01710000006',
      email: 'rina@example.test',
      district: 'Dhaka',
      source: 'messenger',
      lifecycleStage: 'regulars',
      favouriteCategory: 'শাড়ি',
      totalSpendPoisha: 300000,
      ordersCount: 3,
      averageOrderPoisha: 100000,
      firstPurchaseAt: '2026-10-01T04:00:00.000000Z',
      lastPurchaseAt: '2026-11-09T04:00:00.000000Z',
      lifetimeValuePoisha: 300000,
    });
  });

  it('masks both numbers for a member who may not see full phones', async () => {
    const summary = await service.summary(fixture.a, contactId, maskedAccess);
    expect(summary.phone).not.toBe('01710000005');
    expect(summary.whatsappPhone).not.toBe('01710000006');
  });

  it('has no average or lifetime value for a customer with no orders', async () => {
    expect(await service.summary(fixture.a, otherContactId, fullAccess)).toMatchObject({
      ordersCount: 0,
      totalSpendPoisha: 0,
      averageOrderPoisha: null,
      lifetimeValuePoisha: null,
      firstPurchaseAt: null,
      lastPurchaseAt: null,
      lifecycleStage: 'none',
    });
  });

  it('does not show another shop customer on any route', async () => {
    await expect(service.summary(fixture.a, strangerId, fullAccess)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
    await expect(
      service.orders(fixture.a, strangerId, fullAccess, firstPage()),
    ).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
    await expect(service.listNotes(fixture.b, contactId, fullAccess)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
  });

  it('lists orders newest first with the first item, extra lines, photo and delivered total', async () => {
    const productId = randomUUID();
    const variantId = randomUUID();
    const photoId = randomUUID();
    await sql("insert into products(id,store_id,name) values($1,$2,'জামদানি')", [
      productId,
      fixture.a,
    ]);
    await sql(
      `insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status)
       values($1,$2,'product_image',$3,'image/jpeg',42,'ready')`,
      [photoId, fixture.a, `stores/${fixture.a}/photo.jpg`],
    );
    await sql('update products set image_file_ids=array[$1::uuid] where id=$2', [
      photoId,
      productId,
    ]);
    await sql("insert into product_variants(id,store_id,product_id,title) values($1,$2,$3,'লাল')", [
      variantId,
      fixture.a,
      productId,
    ]);
    const oldest = await order(1001, '2026-11-01T09:00:00Z', {
      stage: 'delivered',
      delivered: 90000,
    });
    await addLine(oldest, variantId, 'জামদানি', 0);
    await addLine(oldest, variantId, 'ওড়না', 1);
    await addLine(oldest, variantId, 'ব্যাগ', 2);
    const newest = await order(1002, '2026-11-09T09:00:00Z');
    await addLine(newest, variantId, 'জামদানি', 0);
    await order(1003, '2026-11-12T09:00:00Z', { buyer: otherContactId });

    const { items, nextCursor } = await service.orders(
      fixture.a,
      contactId,
      fullAccess,
      firstPage(),
    );

    expect(nextCursor).toBeNull();
    expect(items.map((item) => item.number)).toEqual([1002, 1001]);
    expect(items[1]).toMatchObject({
      stage: 'delivered',
      source: 'messenger',
      firstItemName: 'জামদানি',
      firstItemVariantTitle: 'লাল',
      otherItemCount: 2,
      // Delivered 90,000 - 5,000 discount + 6,000 delivery.
      totalPoisha: 91000,
    });
    expect(items[1]?.photoUrl).toContain('photo.jpg');
    expect(items[0]).toMatchObject({ otherItemCount: 0, totalPoisha: 101000 });
  });

  it('pages orders without repeating or skipping one', async () => {
    await order(1004, '2026-11-09T09:00:00Z');
    await order(1005, '2026-11-09T09:00:00Z');
    const all = (await service.orders(fixture.a, contactId, fullAccess, firstPage())).items.map(
      (o) => o.id,
    );
    expect(all).toHaveLength(4);
    expect(
      await walk((query) => service.orders(fixture.a, contactId, fullAccess, query), 1),
    ).toEqual(all);
  });

  it('lists campaign messages by the furthest the customer got', async () => {
    const tapped = await campaignMessage('পূজার ছাড়', 'sms', {
      status: 'read',
      sent: '2026-11-10T04:00:00Z',
      delivered: '2026-11-10T04:00:05Z',
      read: '2026-11-10T05:00:00Z',
      tapped: '2026-11-10T05:01:00Z',
    });
    const read = await campaignMessage('ঈদ অফার', 'sms', {
      status: 'read',
      sent: '2026-11-11T04:00:00Z',
      read: '2026-11-11T06:00:00Z',
    });
    const failed = await campaignMessage('নতুন শাড়ি', 'sms', {
      status: 'failed',
      failed: '2026-11-12T04:00:00Z',
    });
    await campaignMessage('এখনও যায়নি', 'sms', { status: 'queued' });

    const { items } = await service.campaigns(fixture.a, contactId, fullAccess, firstPage());

    expect(items.map((item) => [item.recipientId, item.result])).toEqual([
      [failed, 'failed'],
      [read, 'read'],
      [tapped, 'tapped'],
    ]);
    expect(items[2]).toMatchObject({ name: 'পূজার ছাড়', channel: 'sms' });
  });

  it('keeps a note with its author and shows the newest first', async () => {
    const first = await service.addNote(fixture.a, contactId, 'শুক্রবারে ডেলিভারি চান', {
      access: fullAccess,
      userId: fixture.userA,
    });
    await service.addNote(fixture.a, contactId, 'বড় সাইজ লাগে', {
      access: fullAccess,
      userId: fixture.userA,
    });

    await sql("update contacts set notes = 'যোগ করার সময় লেখা' where id = $1", [contactId]);
    const notes = await service.listNotes(fixture.a, contactId, fullAccess);

    // The note typed in Add contact comes last, as the oldest, with no author.
    expect(notes.map((note) => note.body)).toEqual([
      'বড় সাইজ লাগে',
      'শুক্রবারে ডেলিভারি চান',
      'যোগ করার সময় লেখা',
    ]);
    expect(notes[2]).toMatchObject({ id: contactId, authorName: null });
    expect(notes[1]).toMatchObject({ id: first.id, authorName: 'রিনা' });
    expect(await app.get(ContactNotesRepository).list(fixture.b, contactId, 10)).toEqual([]);
  });

  it('switches WhatsApp on and off, keeps each answer and leaves email read only', async () => {
    const before = await service.marketingPreferences(fixture.a, contactId, fullAccess);
    expect(before.map((p) => [p.channel, p.status, p.canSwitch])).toEqual([
      ['whatsapp', 'not_answered', true],
      ['sms', 'not_answered', true],
      ['email', 'not_answered', false],
    ]);

    const on = await service.switchMarketing(
      fixture.a,
      contactId,
      { channel: 'whatsapp', subscribed: true, note: 'দোকানে বলেছেন' },
      { access: fullAccess, actor: { kind: 'user', userId: fixture.userA } },
    );
    expect(on[0]).toMatchObject({ status: 'granted', source: 'manual' });

    const off = await service.switchMarketing(
      fixture.a,
      contactId,
      { channel: 'whatsapp', subscribed: false },
      { access: fullAccess, actor: { kind: 'user', userId: fixture.userA } },
    );
    expect(off[0]?.status).toBe('withdrawn');

    const history = await sql(
      "select status, evidence, captured_by_user_id from consents where contact_id=$1 and channel='whatsapp' order by captured_at",
      [contactId],
    );
    expect(history.rows).toEqual([
      { status: 'granted', evidence: 'দোকানে বলেছেন', captured_by_user_id: fixture.userA },
      {
        status: 'withdrawn',
        evidence: 'Changed on the customer profile',
        captured_by_user_id: fixture.userA,
      },
    ]);
    const events = await sql(
      "select count(*)::int as count from outbox_events where type='consent.changed' and payload->>'contactId'=$1",
      [contactId],
    );
    expect(events.rows[0].count).toBe(2);
  });

  it('builds one timeline from orders, messages, workflows, consent changes and notes', async () => {
    const automationId = randomUUID();
    const versionId = randomUUID();
    await sql(
      "insert into automations(id,store_id,name,trigger_type,draft_graph) values($1,$2,'ফিরে আসুন','consent_given','{}')",
      [automationId, fixture.a],
    );
    await sql(
      "insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,'{}')",
      [versionId, fixture.a, automationId],
    );
    await sql(
      `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status)
       values($1,$2,$3,$4,$5,'k','send','done')`,
      [randomUUID(), fixture.a, automationId, versionId, contactId],
    );

    const { items } = await service.activity(fixture.a, contactId, fullAccess, firstPage(50));
    const kinds = items.map((item) => item.kind);

    for (const kind of [
      'order_placed',
      'order_delivered',
      'campaign_sent',
      'campaign_read',
      'campaign_tapped',
      'automation_entered',
      'consent_changed',
      'note_added',
    ]) {
      expect(kinds).toContain(kind);
    }
    expect(kinds).not.toContain('order_returned');
    expect(items.map((item) => item.at)).toEqual(
      items
        .map((item) => item.at)
        .sort()
        .reverse(),
    );
    expect(items.find((item) => item.kind === 'consent_changed')).toMatchObject({
      channel: 'whatsapp',
      consentSource: 'manual',
    });
    expect(items.find((item) => item.kind === 'campaign_tapped')).toMatchObject({
      subject: 'পূজার ছাড়',
      channel: 'sms',
    });
  });

  it('pages the timeline without repeating or skipping an event', async () => {
    const all = (await service.activity(fixture.a, contactId, fullAccess, firstPage(50))).items.map(
      (e) => e.id,
    );
    expect(new Set(all).size).toBe(all.length);
    expect(
      await walk((query) => service.activity(fixture.a, contactId, fullAccess, query), 3),
    ).toEqual(all);
  });
});
