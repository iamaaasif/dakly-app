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
  const userId = randomUUID();
  const actor = { kind: 'user', userId } as const;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ContactsService);
    transaction = app.get(StoreTransaction);
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
  });

  afterAll(async () => {
    for (const table of ['outbox_events', 'audit_log', 'contacts', 'channel_connections'])
      await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
    await admin.pool.query('delete from stores where id=$1', [storeId]);
    await admin.pool.query('delete from users where id=$1', [userId]);
    await Promise.all([admin.pool.end(), app.close()]);
  });

  const add = (number = phone()) =>
    service.create(storeId, { name: 'সুমি আক্তার', phone: number }, full, actor);
  const search = (term: string, access = masked) =>
    service.list(storeId, { limit: 50, search: term }, access);

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

  it('saves an edit and records who made it without the values', async () => {
    const { id } = await add();

    const edited = await service.editDetails(
      storeId,
      id,
      { name: 'সুমি', tags: ['ঈদ', 'ঢাকা'] },
      { access: masked, actor },
    );

    expect(edited).toMatchObject({ name: 'সুমি', tags: ['ঈদ', 'ঢাকা'] });
    const audit = await admin.pool.query(
      "select actor_user_id, after from audit_log where store_id=$1 and entity_id=$2 and action='contact.updated'",
      [storeId, id],
    );
    expect(audit.rows).toEqual([
      { actor_user_id: userId, after: { changedFields: ['name', 'tags'] } },
    ]);
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
      'select type, payload from outbox_events where store_id=$1',
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
