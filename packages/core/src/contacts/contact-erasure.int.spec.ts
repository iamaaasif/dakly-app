import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import { ContactErasureRepository } from './contact-erasure.repository';

describe('contact erasure (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  // The app role cannot delete consents, so the test proves the cascade does it.
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new ContactErasureRepository(new TenantDatabase(app.db), app.db);
  const contactId = randomUUID();
  const otherId = randomUUID();
  const connectionId = randomUUID();
  const conversationId = randomUUID();
  const orderId = randomUUID();
  const count = async (table: string, where = 'store_id = $1') =>
    (await owner.query(`select count(*)::int as n from ${table} where ${where}`, [fixture.a]))
      .rows[0].n as number;

  beforeAll(async () => {
    await fixture.setup();
    await owner.query(
      `insert into contacts (id,store_id,name,phone,source,kind) values
         ($1,$3,'রিনা','01710000001','manual','customer'),($2,$3,'করিম','01710000002','manual','customer')`,
      [contactId, otherId, fixture.a],
    );
    await owner.query(
      `insert into channel_connections (id,store_id,kind,external_account_id,display_name)
       values ($1,$2,'facebook_page',$3,'Rina')`,
      [connectionId, fixture.a, randomUUID()],
    );
    await owner.query(
      `insert into conversations (id,store_id,contact_id,channel_connection_id,channel)
       values ($1,$2,$3,$4,'messenger')`,
      [conversationId, fixture.a, contactId, connectionId],
    );
    await owner.query(
      `insert into messages (id,store_id,conversation_id,direction,author_type,kind,body,status,attachments)
       values (gen_random_uuid(),$1,$2,'out','system','text','hello','sent',$3::jsonb)`,
      [
        fixture.a,
        conversationId,
        JSON.stringify([{ objectKey: `stores/${fixture.a}/files/photo.jpg` }]),
      ],
    );
    await owner.query(
      `insert into consents (id,store_id,contact_id,channel,status,source)
       values (gen_random_uuid(),$1,$2,'sms','granted','manual')`,
      [fixture.a, contactId],
    );
    await owner.query(
      `insert into orders(id,store_id,number,buyer_contact_id,conversation_id,source,created_by_type,
         stage,recipient_name,recipient_phone,recipient_address,recipient_district,
         items_subtotal_poisha,order_discount_poisha,delivery_charge_poisha,cod_amount_poisha,
         payment_status,attributed_source_type,attributed_source_id,attributed_amount_poisha)
       values ($1,$2,1,$3,$4,'manual','user','delivered','রিনা','01710000001','Mirpur','Dhaka',
         10000,0,0,10000,'cod_pending','campaign',$5,10000)`,
      [orderId, fixture.a, contactId, conversationId, randomUUID()],
    );
  });

  afterAll(async () => {
    await app.pool.end();
    await owner.query('delete from orders where store_id = $1', [fixture.a]);
    await fixture.close();
  });

  it('removes the person and keeps the order without attribution', async () => {
    expect(await repository.erase(fixture.a, contactId)).toEqual({
      found: true,
      conversationIds: [conversationId],
      attachmentKeys: [`stores/${fixture.a}/files/photo.jpg`],
    });

    expect(await count('contacts')).toBe(1);
    expect(await count('conversations')).toBe(0);
    expect(await count('messages')).toBe(0);
    expect(await count('consents')).toBe(0);
    const [order] = (
      await owner.query(
        `select buyer_contact_id, conversation_id, attributed_source_type, attributed_source_id,
           attributed_amount_poisha from orders where id = $1`,
        [orderId],
      )
    ).rows;
    expect(order).toEqual({
      buyer_contact_id: null,
      conversation_id: null,
      attributed_source_type: null,
      attributed_source_id: null,
      attributed_amount_poisha: null,
    });
  });

  it('leaves other customers alone and reports an unknown one', async () => {
    expect(await repository.erase(fixture.a, contactId)).toEqual({
      found: false,
      conversationIds: [],
      attachmentKeys: [],
    });
    expect(await repository.erase(fixture.b, otherId)).toEqual({
      found: false,
      conversationIds: [],
      attachmentKeys: [],
    });
  });

  it('lists customers deleted more than 30 days ago as due', async () => {
    const old = randomUUID();
    const recent = randomUUID();
    await owner.query(
      `insert into contacts (id,store_id,name,source,kind,deleted_at) values
         ($1,$3,'পুরনো','manual','customer', now() - interval '31 days'),
         ($2,$3,'নতুন','manual','customer', now() - interval '2 days')`,
      [old, recent, fixture.a],
    );
    const due = await repository.dueDeleted(1000);
    expect(due).toContainEqual({ storeId: fixture.a, contactId: old });
    expect(due).not.toContainEqual({ storeId: fixture.a, contactId: recent });
  });
});
