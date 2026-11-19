import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ContactsModule } from './contacts.module';
import { ContactsService } from './contacts.service';

class TestModule {}
Module({ imports: [DatabaseModule, ContactsModule] })(TestModule);

const masked = { seeFullPhone: false };
const full = { seeFullPhone: true };
const phone = () => `017${randomInt(10000000, 99999999)}`;
const toBangla = (digits: string) =>
  digits.replace(/\d/g, (digit) => String.fromCharCode('০'.charCodeAt(0) + Number(digit)));

describe('ContactsService (Postgres)', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  let app: INestApplicationContext;
  let service: ContactsService;
  let transaction: StoreTransaction;
  const storeId = randomUUID();
  const actor = { kind: 'user', userId: randomUUID() } as const;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ContactsService);
    transaction = app.get(StoreTransaction);
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
  });

  afterAll(async () => {
    for (const table of ['outbox_events', 'contacts', 'channel_connections'])
      await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
    await admin.pool.query('delete from stores where id=$1', [storeId]);
    await Promise.all([admin.pool.end(), app.close()]);
  });

  const add = (number = phone()) =>
    service.create(storeId, { name: 'সুমি আক্তার', phone: number }, full, actor);
  const search = (term: string, access = masked) =>
    service.list(storeId, { limit: 50, search: term }, access);

  it('marks the buyer as changed when an order links to them', async () => {
    const buyer = await add();
    const previous = '2026-11-17T06:00:00.000Z';
    await admin.pool.query('update contacts set updated_at=$2 where id=$1', [buyer.id, previous]);

    await transaction.run(storeId, () => service.markOrderLinked(storeId, buyer.id, actor));

    const updated = await admin.pool.query<{ updated_at: Date; phone: string }>(
      'select updated_at, phone from contacts where id=$1',
      [buyer.id],
    );
    expect(updated.rows[0]!.updated_at.getTime()).toBeGreaterThan(Date.parse(previous));
    expect(updated.rows[0]!.phone).toBe(buyer.phone);
  });

  it('keeps two self-delivery buyers separate when they supply the same own phone at once', async () => {
    const ownPhone = phone();
    const orders = [randomUUID(), randomUUID()] as const;
    const { id: firstId } = await service.resolveOrderBuyer(
      storeId,
      {
        buyer: { name: 'Rahim' },
        orderId: orders[0],
      },
      actor,
    );
    const { id: secondId } = await service.resolveOrderBuyer(
      storeId,
      {
        buyer: { name: 'Karim' },
        orderId: orders[1],
      },
      actor,
    );
    const [first, second] = await Promise.all([
      service.resolveOrderBuyer(
        storeId,
        {
          buyer: { contactId: firstId },
          ownPhone,
          orderId: orders[0],
        },
        actor,
      ),
      service.resolveOrderBuyer(
        storeId,
        {
          buyer: { contactId: secondId },
          ownPhone,
          orderId: orders[1],
        },
        actor,
      ),
    ]);

    expect([first.id, second.id]).toEqual([firstId, secondId]);
    const profiles = await admin.pool.query(
      'select id,phone,phone_verified_at from contacts where id=any($1) order by phone nulls last',
      [[firstId, secondId]],
    );
    expect(
      profiles.rows.map(({ phone, phone_verified_at }) => ({ phone, phone_verified_at })),
    ).toEqual([
      { phone: ownPhone, phone_verified_at: null },
      { phone: null, phone_verified_at: null },
    ]);
    const suggestions = await admin.pool.query(
      'select contact_id,matched_contact_id,reason,order_id from contact_match_suggestions where store_id=$1',
      [storeId],
    );
    const [owner, conflict] = profiles.rows;
    expect(suggestions.rows).toEqual([
      {
        contact_id: conflict.id,
        matched_contact_id: owner.id,
        reason: 'same_phone',
        order_id: orders[conflict.id === firstId ? 0 : 1],
      },
    ]);
  });

  it('finds a contact by its full number written any way, masked without the flag', async () => {
    const number = phone();
    const { id } = await add(number);

    for (const term of [number, `+88${number}`, toBangla(number.slice(1))])
      expect((await search(term)).items).toEqual([
        expect.objectContaining({ id, phone: `${number.slice(0, 5)}-XXX${number.slice(-3)}` }),
      ]);
  });

  it('finds nothing from part of a number unless the member sees full phones', async () => {
    const number = phone();
    const { id } = await add(number);
    const prefix = number.slice(0, 9);

    expect((await search(prefix)).items).toEqual([]);
    expect((await search(prefix, full)).items.map((item) => item.id)).toContain(id);
  });

  it('rejects an edit to a phone another contact has, naming no one', async () => {
    const taken = phone();
    await add(taken);
    const { id } = await add();

    await expect(
      service.editDetails(storeId, id, { phone: taken }, { access: full, actor }),
    ).rejects.toMatchObject({
      code: 'CONTACT_PHONE_TAKEN',
      status: 409,
      message: 'A contact with this phone number already exists',
    });
    expect((await service.getById(storeId, id, full)).phone).not.toBe(taken);
  });

  it('saves an edit and clears the verification of a changed phone', async () => {
    const { id } = await add();
    await admin.pool.query('update contacts set phone_verified_at=now() where id=$1', [id]);

    const named = await service.editDetails(
      storeId,
      id,
      { name: 'সুমি', tags: ['ঈদ', 'ঢাকা'] },
      { access: masked, actor },
    );
    expect(named).toMatchObject({ name: 'সুমি', tags: ['ঈদ', 'ঢাকা'] });
    const verified = await admin.pool.query('select phone_verified_at from contacts where id=$1', [
      id,
    ]);
    expect(verified.rows[0].phone_verified_at).not.toBeNull();

    const number = phone();
    await service.editDetails(storeId, id, { phone: number }, { access: masked, actor });
    const changed = await admin.pool.query(
      'select phone, phone_verified_at from contacts where id=$1',
      [id],
    );
    expect(changed.rows).toEqual([{ phone: number, phone_verified_at: null }]);
  });

  it('removes a deleted contact from the list and the profile', async () => {
    const number = phone();
    const { id } = await add(number);

    await service.remove(storeId, id, actor);

    expect((await search(number)).items).toEqual([]);
    await expect(service.getById(storeId, id, full)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
    await expect(service.remove(storeId, id, actor)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
  });

  it('publishes contact.created with the create and rolls it back with it', async () => {
    const { id } = await add();
    const rolledBack = phone();

    await expect(
      transaction.run(storeId, async () => {
        await add(rolledBack);
        throw new Error('Later step failed');
      }),
    ).rejects.toThrow('Later step failed');

    const events = await admin.pool.query(
      "select type, payload from outbox_events where store_id=$1 and type='contact.created'",
      [storeId],
    );
    expect(events.rows).toContainEqual({ type: 'contact.created', payload: { contactId: id } });
    const contacts = await admin.pool.query('select id from contacts where store_id=$1', [storeId]);
    expect(events.rows).toHaveLength(contacts.rows.length);
    expect((await search(rolledBack)).items).toEqual([]);
  });

  it('shows the channel identities on the profile', async () => {
    const { id } = await add();
    const connectionId = randomUUID();
    await admin.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1,$2,'facebook_page',$3,'রিনার পেজ')",
      [connectionId, storeId, randomUUID()],
    );
    await admin.pool.query(
      "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id,profile_name) values(gen_random_uuid(),$1,$2,$3,'messenger','psid-1','Sumi Akter')",
      [storeId, id, connectionId],
    );

    expect((await service.getById(storeId, id, masked)).identities).toEqual([
      {
        id: expect.any(String),
        channel: 'messenger',
        channelConnectionId: connectionId,
        profileName: 'Sumi Akter',
      },
    ]);
  });
});
