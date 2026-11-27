import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import type { CampaignChannel } from '@dakly/contracts/campaigns';
import type {
  ConsentChannel,
  ConsentSource,
  ConsentStatus,
  ContactSource,
  lifecycleStages,
} from '@dakly/contracts/contacts';
import type {
  CustomerActivityKind,
  customerCampaignResults,
} from '@dakly/contracts/customer-profile';
import type { orderPaymentStatuses, orderSources, OrderStage } from '@dakly/contracts/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

// Times leave Postgres as UTC text with microseconds, so a page cursor made from one never
// skips or repeats a row (a JavaScript Date keeps only milliseconds).
const utcText = (column: SQL) =>
  sql`to_char(${column} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export type PageAfter = { at: string; key: string };

export type ProfileFields = {
  whatsappPhone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  source: ContactSource;
  favouriteCategory: string | null;
  lifecycleStage: (typeof lifecycleStages)[number] | null;
  ordersCount: number;
  netSpendPoisha: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
};

export type OrderRow = {
  id: string;
  number: number;
  at: string;
  source: (typeof orderSources)[number];
  stage: OrderStage;
  paymentStatus: (typeof orderPaymentStatuses)[number];
  totalPoisha: string;
  firstItemName: string | null;
  firstItemVariantTitle: string | null;
  otherItemCount: number;
  photoKey: string | null;
};

export type ActivityRow = {
  key: string;
  kind: CustomerActivityKind;
  at: string;
  subject: string | null;
  channel: CampaignChannel | ConsentChannel | null;
  consentStatus: ConsentStatus | null;
  consentSource: ConsentSource | null;
};

export type CampaignRow = {
  recipientId: string;
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  at: string;
  result: (typeof customerCampaignResults)[number];
};

// Read-only reads across features, listed in docs/rules/module-boundaries.md. The profile shows
// one customer's orders, messages and workflow runs, so each page is one indexed query by contact.
@Injectable()
export class CustomerProfileRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async fields(storeId: string, contactId: string): Promise<ProfileFields | undefined> {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<ProfileFields>(sql`
        select c.whatsapp_phone as "whatsappPhone", c.email::text as email, c.address, c.district,
               c.source, s.favourite_category as "favouriteCategory",
               s.lifecycle_stage as "lifecycleStage", coalesce(s.orders_count, 0) as "ordersCount",
               coalesce(s.net_spend_poisha, 0)::text as "netSpendPoisha",
               ${utcText(sql`s.first_order_at`)} as "firstOrderAt",
               ${utcText(sql`s.last_order_at`)} as "lastOrderAt"
        from contacts c
        left join contact_stats s on s.contact_id = c.id and s.store_id = c.store_id
        where c.store_id = ${storeId} and c.id = ${contactId} and c.deleted_at is null`),
    );
    return rows[0];
  }

  async orders(storeId: string, contactId: string, after: PageAfter | undefined, limit: number) {
    const cursor = after
      ? sql`and (o.created_at, o.id) < (${after.at}::timestamptz, ${after.key}::uuid)`
      : sql``;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<OrderRow>(sql`
        select o.id, o.number, ${utcText(sql`o.created_at`)} as at, o.source, o.stage,
               o.payment_status as "paymentStatus",
               (coalesce(o.delivered_items_subtotal_poisha, o.items_subtotal_poisha)
                 - coalesce(o.delivered_order_discount_poisha, o.order_discount_poisha)
                 + o.delivery_charge_poisha)::text as "totalPoisha",
               line.product_name as "firstItemName", line.variant_title as "firstItemVariantTitle",
               greatest(line.lines - 1, 0)::int as "otherItemCount", photo.object_key as "photoKey"
        from orders o
        left join lateral (
          select i.product_name, i.variant_title, i.variant_id, count(*) over () as lines
          from order_items i
          where i.store_id = o.store_id and i.order_id = o.id
          order by i.created_at, i.id limit 1) line on true
        left join lateral (
          select f.object_key
          from product_variants v
          join products p on p.store_id = v.store_id and p.id = v.product_id
          join files f on f.store_id = v.store_id
            and f.id = coalesce(v.image_file_ids[1], p.image_file_ids[1])
            and f.purpose = 'product_image' and f.status = 'ready'
          where v.store_id = o.store_id and v.id = line.variant_id) photo on true
        where o.store_id = ${storeId} and o.buyer_contact_id = ${contactId} ${cursor}
        order by o.created_at desc, o.id desc
        limit ${limit + 1}`),
    );
    return rows;
  }

  async campaigns(storeId: string, contactId: string, after: PageAfter | undefined, limit: number) {
    const cursor = after
      ? sql`and (coalesce(r.sent_at, r.failed_at, r.created_at), r.id)
              < (${after.at}::timestamptz, ${after.key}::uuid)`
      : sql``;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<CampaignRow>(sql`
        select r.id as "recipientId", c.id as "campaignId", c.name, c.channel,
               ${utcText(sql`coalesce(r.sent_at, r.failed_at, r.created_at)`)} as at,
               case when r.tapped_at is not null then 'tapped'
                    when r.read_at is not null then 'read'
                    when r.delivered_at is not null then 'delivered'
                    when r.status = 'failed' then 'failed'
                    else 'sent' end as result
        from campaign_recipients r
        join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
        where r.store_id = ${storeId} and r.contact_id = ${contactId}
          and r.status in ('sent', 'delivered', 'read', 'failed') ${cursor}
        order by coalesce(r.sent_at, r.failed_at, r.created_at) desc, r.id desc
        limit ${limit + 1}`),
    );
    return rows;
  }

  // The key is "<kind>:<row id>": one order or message gives several events, so the row id alone
  // would not tell them apart.
  async activity(storeId: string, contactId: string, after: PageAfter | undefined, limit: number) {
    const cursor = after
      ? sql`where (e.at, e.key) < (${after.at}::timestamptz, ${after.key}::text)`
      : sql``;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<ActivityRow>(sql`
        select e.key, e.kind, ${utcText(sql`e.at`)} as at, e.subject, e.channel,
               e.consent_status as "consentStatus", e.consent_source as "consentSource"
        from (
          select 'order_placed:' || o.id as key, 'order_placed' as kind, o.created_at as at,
                 o.number::text as subject, null::text as channel,
                 null::text as consent_status, null::text as consent_source
          from orders o where o.store_id = ${storeId} and o.buyer_contact_id = ${contactId}
          union all
          select 'order_delivered:' || o.id, 'order_delivered', o.delivered_at, o.number::text,
                 null, null, null
          from orders o where o.store_id = ${storeId} and o.buyer_contact_id = ${contactId}
            and o.delivered_at is not null
          union all
          select 'order_returned:' || o.id, 'order_returned', o.returned_at, o.number::text,
                 null, null, null
          from orders o where o.store_id = ${storeId} and o.buyer_contact_id = ${contactId}
            and o.returned_at is not null
          union all
          select 'order_cancelled:' || o.id, 'order_cancelled', o.cancelled_at, o.number::text,
                 null, null, null
          from orders o where o.store_id = ${storeId} and o.buyer_contact_id = ${contactId}
            and o.cancelled_at is not null
          union all
          select 'campaign_sent:' || r.id, 'campaign_sent', r.sent_at, c.name, c.channel, null, null
          from campaign_recipients r join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
          where r.store_id = ${storeId} and r.contact_id = ${contactId} and r.sent_at is not null
          union all
          select 'campaign_read:' || r.id, 'campaign_read', r.read_at, c.name, c.channel, null, null
          from campaign_recipients r join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
          where r.store_id = ${storeId} and r.contact_id = ${contactId} and r.read_at is not null
          union all
          select 'campaign_tapped:' || r.id, 'campaign_tapped', r.tapped_at, c.name, c.channel, null, null
          from campaign_recipients r join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
          where r.store_id = ${storeId} and r.contact_id = ${contactId} and r.tapped_at is not null
          union all
          select 'automation_entered:' || ar.id, 'automation_entered', ar.entered_at, a.name,
                 null, null, null
          from automation_runs ar join automations a on a.store_id = ar.store_id and a.id = ar.automation_id
          where ar.store_id = ${storeId} and ar.contact_id = ${contactId}
          union all
          select 'consent_changed:' || k.id, 'consent_changed', k.captured_at, null, k.channel,
                 k.status, k.source
          from consents k where k.store_id = ${storeId} and k.contact_id = ${contactId}
          union all
          select 'note_added:' || n.id, 'note_added', n.created_at, null, null, null, null
          from contact_notes n where n.store_id = ${storeId} and n.contact_id = ${contactId}
        ) e ${cursor}
        order by e.at desc, e.key desc
        limit ${limit + 1}`),
    );
    return rows;
  }
}
