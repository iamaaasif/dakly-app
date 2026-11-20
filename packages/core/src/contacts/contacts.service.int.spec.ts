import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ContactMatchSuggestionsService } from './contact-match-suggestions.service';
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
  let suggestions: ContactMatchSuggestionsService;
  let transaction: StoreTransaction;
  let valkey: ValkeyClient;
  const storeId = randomUUID();
  const otherStoreId = randomUUID();
  const actor = { kind: 'user', userId: randomUUID() } as const;
  const limitedActor = { kind: 'user', userId: randomUUID() } as const;
  const lookupKey = `contacts:phone-lookup:${storeId}:${limitedActor.userId}`;
  const writeKey = `contacts:phone-write:${storeId}:${limitedActor.userId}`;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ContactsService);
    suggestions = app.get(ContactMatchSuggestionsService);
    transaction = app.get(StoreTransaction);
    valkey = app.get(ValkeyClient);
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'সুমির দোকান')",
      [storeId, otherStoreId],
    );
    await admin.pool.query('insert into users(id,name,phone) values($1,$2,$3)', [
      limitedActor.userId,
      'করিম',
      phone(),
    ]);
  });

  afterAll(async () => {
    for (const table of ['audit_log', 'outbox_events', 'contacts', 'channel_connections'])
      await admin.pool.query(`delete from ${table} where store_id=any($1)`, [
        [storeId, otherStoreId],
      ]);
    await admin.pool.query('delete from stores where id=any($1)', [[storeId, otherStoreId]]);
    await admin.pool.query('delete from users where id=$1', [limitedActor.userId]);
    await valkey.connection.del(
      lookupKey,
      writeKey,
      `contacts:phone-lookup:${storeId}:${actor.userId}`,
      `contacts:phone-lookup:${otherStoreId}:${limitedActor.userId}`,
      `contacts:phone-write:${otherStoreId}:${limitedActor.userId}`,
    );
    await Promise.all([admin.pool.end(), app.close()]);
  });

  const add = (number = phone()) =>
    service.create(storeId, { name: 'সুমি আক্তার', phone: number }, full, actor);
  const search = (term: string, access = masked) =>
    service.list(storeId, { limit: 50, search: term }, access, actor);

  const refusals = async (action: string) =>
    (
      await admin.pool.query(
        'select actor_user_id, entity_type, entity_id, before, after, reason from audit_log where store_id=$1 and action=$2',
        [storeId, action],
      )
    ).rows;

  const refusal = {
    actor_user_id: limitedActor.userId,
    entity_type: 'store',
    entity_id: storeId,
    before: null,
    after: null,
    reason: null,
  };

  it('limits exact searches by a masked member and opens a new window after expiry', async () => {
    const number = phone();
    const { id } = await add(number);
    const find = (term: string, access = masked, store = storeId, member = limitedActor) =>
      service.list(store, { limit: 50, search: term }, access, member);

    expect((await find(`+88${number}`)).items.map((item) => item.id)).toEqual([id]);
    const missing = phone();
    const partial = number.slice(0, 5);
    expect((await find(partial)).items).toEqual([]);
    for (let attempt = 2; attempt < 30; attempt++) expect((await find(missing)).items).toEqual([]);

    for (const term of [number, missing, partial])
      await expect(find(term)).rejects.toMatchObject({
        code: 'CONTACT_PHONE_RATE_LIMITED',
        status: 429,
      });
    expect(await refusals('contact.phone_lookup_rate_limited')).toEqual([
      refusal,
      refusal,
      refusal,
    ]);
    expect((await find(number, full)).items[0]?.phone).toBe(number);
    expect((await find(number, masked, otherStoreId)).items).toEqual([]);
    expect((await find(number, masked, storeId, actor)).items[0]?.id).toBe(id);
    expect((await find('সুমি')).items.map((item) => item.id)).toContain(id);

    const lookupTtl = await valkey.connection.ttl(lookupKey);
    expect(lookupTtl).toBeGreaterThan(3500);
    expect(lookupTtl).toBeLessThanOrEqual(3600);
    await valkey.connection.pexpire(lookupKey, 1);
    await setTimeout(10);
    expect((await find(number)).items[0]?.id).toBe(id);
  });

  it('shares the masked phone-write limit between creation and edits without changing refused contacts', async () => {
    const original = phone();
    const { id } = await add(original);
    const editor = { access: masked, actor: limitedActor };
    const create = (number: string, store = storeId, access = masked) =>
      service.create(store, { name: 'করিম', phone: number }, access, limitedActor);
    const edit = (number: string, access = masked) =>
      service.editDetails(storeId, id, { phone: number }, { ...editor, access });

    for (let attempt = 0; attempt < 9; attempt++)
      await expect(create(original)).rejects.toMatchObject({ code: 'CONTACT_PHONE_TAKEN' });
    const edited = phone();
    await edit(edited);
    const createdEvents = () =>
      admin.pool.query(
        "select id from outbox_events where store_id=$1 and type='contact.created'",
        [storeId],
      );
    const before = await createdEvents();
    const refused = phone();
    const refusedEdit = () =>
      service.editDetails(storeId, id, { phone: refused, name: 'করিম' }, editor);
    for (const write of [() => create(refused), refusedEdit])
      await expect(write()).rejects.toMatchObject({
        code: 'CONTACT_PHONE_RATE_LIMITED',
        status: 429,
      });

    expect(await service.getById(storeId, id, full)).toMatchObject({
      name: 'সুমি আক্তার',
      phone: edited,
    });
    expect((await search(refused, full)).items).toEqual([]);
    expect((await createdEvents()).rowCount).toBe(before.rowCount);
    expect(await refusals('contact.phone_write_rate_limited')).toEqual([refusal, refusal]);
    await expect(service.editDetails(storeId, id, { name: 'সুমি' }, editor)).resolves.toMatchObject({
      name: 'সুমি',
    });
    await expect(create(refused, otherStoreId)).resolves.toMatchObject({ name: 'করিম' });
    await expect(edit(refused, full)).resolves.toMatchObject({ phone: refused });

    const writeTtl = await valkey.connection.ttl(writeKey);
    expect(writeTtl).toBeGreaterThan(3500);
    expect(writeTtl).toBeLessThanOrEqual(3600);
    await valkey.connection.pexpire(writeKey, 1);
    await setTimeout(10);
    await expect(edit(edited)).resolves.toMatchObject({ id });
  });

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

  describe('own phone capture (D27)', () => {
    const chatContact = async () => {
      const id = randomUUID();
      await admin.pool.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'Rahim','messenger','chat_only')",
        [id, storeId],
      );
      return id;
    };
    const profile = async (id: string) =>
      (
        await admin.pool.query('select phone, kind, phone_verified_at from contacts where id=$1', [
          id,
        ])
      ).rows[0];
    const capture = (contactId: string, own: string, conversationId = randomUUID()) =>
      suggestions.captureOwnPhone(storeId, { contactId, phone: own, conversationId });

    it('saves an unused own phone before any order and makes the chat contact a lead', async () => {
      const id = await chatContact();
      const own = phone();

      await capture(id, own);

      expect(await profile(id)).toEqual({ phone: own, kind: 'lead', phone_verified_at: null });
      await expect(suggestions.list(storeId, id, full)).resolves.toEqual([]);
    });

    it('keeps both profiles and suggests a match when another contact has the phone', async () => {
      const owner = await add();
      const id = await chatContact();
      const conversationId = randomUUID();

      await expect(capture(id, owner.phone!, conversationId)).resolves.toBeUndefined();

      expect(await profile(id)).toEqual({
        phone: null,
        kind: 'chat_only',
        phone_verified_at: null,
      });
      const stored = await admin.pool.query(
        'select contact_id, matched_contact_id, reason, conversation_id from contact_match_suggestions where contact_id=$1',
        [id],
      );
      expect(stored.rows).toEqual([
        {
          contact_id: id,
          matched_contact_id: owner.id,
          reason: 'same_phone',
          conversation_id: conversationId,
        },
      ]);
      await capture(id, owner.phone!);
      expect(await suggestions.list(storeId, id, masked)).toHaveLength(1);
    });

    it('keeps a different phone already on the profile', async () => {
      const buyer = await add();

      await capture(buyer.id, phone());

      expect(await profile(buyer.id)).toMatchObject({ phone: buyer.phone, kind: 'customer' });
    });

    it('shows the other contact to both sides, masked without the flag, until staff dismiss it', async () => {
      const owner = await add();
      const id = await chatContact();
      await capture(id, owner.phone!);

      const [seen] = await suggestions.list(storeId, id, masked);
      expect(seen).toMatchObject({
        reason: 'same_phone',
        otherContact: { id: owner.id, name: 'সুমি আক্তার', phone: expect.stringContaining('XXX') },
      });
      expect(JSON.stringify(seen)).not.toContain(owner.phone);
      const [reverse] = await suggestions.list(storeId, owner.id, full);
      expect(reverse!.otherContact).toMatchObject({ id, phone: null });

      await suggestions.dismiss(storeId, seen!.id, limitedActor.userId);

      expect(await suggestions.list(storeId, id, full)).toEqual([]);
      await expect(
        suggestions.dismiss(storeId, seen!.id, limitedActor.userId),
      ).rejects.toMatchObject({ code: 'MATCH_SUGGESTION_NOT_FOUND', status: 404 });
    });

    it('does not read or change a contact of another store', async () => {
      await expect(
        suggestions.captureOwnPhone(otherStoreId, {
          contactId: await chatContact(),
          phone: phone(),
        }),
      ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND' });
    });
  });
});
