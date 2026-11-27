import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ContactListRepository } from './contact-list.repository';
import { ContactsRepository } from './contacts.repository';
import { ImportContactsRepository } from './import-contacts.repository';

// A staff add, as ContactsService.create saves it.
const manualCustomer = { source: 'manual', kind: 'customer' } as const;

describe('contact filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new ContactsRepository(f.tenant);
  const listing = new ContactListRepository(f.tenant);
  const imports = new ImportContactsRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());
  it('inserts into the selected store and finds only its contacts', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'রিনা',
      phone: '01711000001',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'করিম',
      phone: '01711000001',
    });
    expect((await f.row('contacts', b!.id)).store_id).toBe(f.b);
    expect(await repository.findById(f.a, a!.id)).toMatchObject({ name: 'রিনা' });
    expect(await repository.findById(f.b, b!.id)).toMatchObject({ name: 'করিম' });
    expect(await repository.findById(f.b, a!.id)).toBeUndefined();
    expect(await repository.findRecipient(f.a, a!.id)).toEqual({
      kind: 'customer',
      isBlocked: false,
      isOverPlanLimit: false,
      hasPhone: true,
    });
    expect(await repository.findRecipient(f.b, a!.id)).toBeUndefined();
    await repository.changeTag(f.b, a!.id, { tag: 'vip', change: 'add' }, 50);
    expect(await repository.findTags(f.a, a!.id)).toEqual([]);
    await repository.changeTag(f.a, a!.id, { tag: 'vip', change: 'add' }, 50);
    await repository.changeTag(f.a, a!.id, { tag: 'vip', change: 'add' }, 50);
    expect(await repository.findTags(f.b, a!.id)).toEqual([]);
    expect(await repository.findTags(f.a, a!.id)).toEqual(['vip']);
    // At the limit a new tag is not added.
    await repository.changeTag(f.a, a!.id, { tag: 'gold', change: 'add' }, 1);
    expect(await repository.findTags(f.a, a!.id)).toEqual(['vip']);
    await repository.changeTag(f.b, a!.id, { tag: 'vip', change: 'remove' }, 50);
    expect(await repository.findTags(f.a, a!.id)).toEqual(['vip']);
    await repository.changeTag(f.a, a!.id, { tag: 'vip', change: 'remove' }, 50);
    expect(await repository.findTags(f.a, a!.id)).toEqual([]);
    expect(await repository.findRecipients(f.b, [a!.id, b!.id])).toEqual([
      {
        id: b!.id,
        kind: 'customer',
        isBlocked: false,
        isOverPlanLimit: false,
        phone: '01711000001',
      },
    ]);
  });

  it('lists, edits, deletes and reads identities only in the selected store', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000002',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000002',
    });
    const connectionId = randomUUID();
    await f.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1,$2,'facebook_page',$3,'রিনার পেজ')",
      [connectionId, f.a, randomUUID()],
    );
    await f.connection.pool.query(
      "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger','psid-1')",
      [f.a, a!.id, connectionId],
    );

    const listed = await listing.list(f.b, { limit: 50, phone: '01711000002' });
    expect(listed.map((row) => row.id)).toEqual([b!.id]);
    expect(await repository.findIdentities(f.b, a!.id)).toEqual([]);
    expect(await repository.update(f.b, a!.id, { name: 'করিম' })).toBeUndefined();
    expect(await repository.softDeleteAll(f.b, [a!.id], new Date())).toEqual([]);
    expect(await f.row('contacts', a!.id)).toMatchObject({ name: 'সুমি', deleted_at: null });
    expect(await repository.findIdentities(f.a, a!.id)).toHaveLength(1);
  });

  it('counts and lists segment matches only in the selected store', async () => {
    const a = await repository.insert(f.a, {
      ...manualCustomer,
      name: 'সুমি',
      phone: '01711000003',
    });
    const b = await repository.insert(f.b, {
      ...manualCustomer,
      name: 'সুমন',
      phone: '01711000003',
    });
    await f.connection.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','granted','manual'),(gen_random_uuid(),$3,$4,'sms','granted','manual')",
      [f.a, a!.id, f.b, b!.id],
    );
    const rules = {
      match: 'all',
      conditions: [{ field: 'consent', channel: 'sms', granted: true }],
    } as const;

    expect(await repository.countMatching(f.b, rules)).toBe(1);
    expect(await repository.countReachable(f.b, rules)).toEqual({
      whatsapp: 0,
      sms: 1,
      messenger: 0,
    });
    expect(await repository.listIdsMatching(f.b, rules, { limit: 100 })).toEqual([b!.id]);
    expect(await repository.isMatching(f.b, b!.id, rules)).toBe(true);
    expect(await repository.isMatching(f.b, a!.id, rules)).toBe(false);
    expect(await repository.isMatching(f.a, a!.id, rules)).toBe(true);
    await f.connection.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) values(gen_random_uuid(),$1,$2,'sms','not_answered','import',now()+interval '1 minute')",
      [f.b, b!.id],
    );
    expect(await repository.countMatching(f.b, rules)).toBe(0);
    expect(await repository.listIdsMatching(f.b, rules, { limit: 100 })).toEqual([]);
    const unanswered = {
      ...rules,
      conditions: [{ field: 'consent', channel: 'sms', granted: false }],
    } as const;
    expect(await repository.listIdsMatching(f.b, unanswered, { limit: 100 })).toContain(b!.id);
  });

  it('finds, adds and updates imported contacts only in the selected store', async () => {
    const importA = randomUUID();
    const fileA = randomUUID();
    await f.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes) values($1::uuid,$2,'import',$1::text,'text/csv',10)",
      [fileA, f.a],
    );
    await f.connection.pool.query(
      "insert into imports(id,store_id,kind,file_id) values($1,$2,'customers_csv',$3)",
      [importA, f.a, fileA],
    );
    const phone = '01711000009';
    const [added] = await imports.insertImported(f.a, [
      {
        phone,
        name: 'শাহনাজ',
        tags: ['ঈদ'],
        importId: importA,
        source: 'import',
        kind: 'customer',
      },
    ]);
    const b = await repository.insert(f.b, { ...manualCustomer, name: 'করিম', phone });
    expect(await f.row('contacts', added!.id)).toMatchObject({
      store_id: f.a,
      import_id: importA,
      source: 'import',
    });
    expect(await imports.findByPhones(f.b, [phone])).toEqual([
      { id: b!.id, phone, importId: null, whatsappPhone: null, tags: [] },
    ]);
    expect(await repository.lockForConsent(f.b, [added!.id, b!.id])).toEqual([b!.id]);
    await f.connection.pool.query('update contacts set deleted_at=now() where id=$1', [b!.id]);
    expect(await repository.lockForConsent(f.b, [added!.id, b!.id])).toEqual([]);
    expect(await imports.lockConsentHistory(f.b, [added!.id, b!.id])).toEqual([b!.id]);
    await f.connection.pool.query('update contacts set deleted_at=null where id=$1', [b!.id]);

    await imports.updateImported(f.b, [{ id: added!.id, name: 'অন্য দোকান', tags: ['বি'] }]);
    await imports.updateImported(f.a, [{ id: b!.id, name: 'অন্য দোকান' }]);
    expect(await f.row('contacts', added!.id)).toMatchObject({ name: 'শাহনাজ', tags: ['ঈদ'] });
    expect(await f.row('contacts', b!.id)).toMatchObject({ name: 'করিম' });
  });

  it('keeps import undo eligibility for no-op tags and loses it for a real tag edit', async () => {
    const importId = randomUUID();
    const fileId = randomUUID();
    await f.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes) values($1::uuid,$2,'import',$1::text,'text/csv',10)",
      [fileId, f.a],
    );
    await f.connection.pool.query(
      "insert into imports(id,store_id,kind,file_id) values($1,$2,'customers_csv',$3)",
      [importId, f.a, fileId],
    );
    const [contact] = await imports.insertImported(f.a, [
      { importId, source: 'import', kind: 'customer', phone: '01711000024' },
    ]);
    const id = contact!.id;
    await f.connection.pool.query(
      "update contacts set tags = array['vip'], created_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z' where id = $1",
      [id],
    );
    for (const change of [
      { tag: 'absent', change: 'remove' },
      { tag: 'vip', change: 'add' },
      { tag: 'gold', change: 'add' },
    ] as const) {
      await repository.changeTag(f.a, id, change, 1);
      expect(await repository.lockUneditedByImport(f.a, importId, { limit: 10 })).toEqual([id]);
      expect((await f.row('contacts', id)).tags).toEqual(['vip']);
    }
    await repository.changeTag(f.a, id, { tag: 'gold', change: 'add' }, 2);
    expect((await f.row('contacts', id)).tags).toEqual(['vip', 'gold']);
    expect(await repository.lockUneditedByImport(f.a, importId, { limit: 10 })).toEqual([]);
  });

  it('locks and soft deletes unedited contacts of an import only in the selected store', async () => {
    const importId = randomUUID();
    const fileId = randomUUID();
    await f.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes) values($1::uuid,$2,'import',$1::text,'text/csv',10)",
      [fileId, f.a],
    );
    await f.connection.pool.query(
      "insert into imports(id,store_id,kind,file_id) values($1,$2,'customers_csv',$3)",
      [importId, f.a, fileId],
    );
    const imported = { importId, source: 'import', kind: 'customer' } as const;
    const [first, second, edited] = (
      await imports.insertImported(f.a, [
        { ...imported, phone: '01711000021' },
        { ...imported, phone: '01711000022' },
        { ...imported, phone: '01711000023' },
      ])
    )
      .map((row) => row.id)
      .sort();
    await f.connection.pool.query(
      "update contacts set updated_at = created_at + interval '1 minute' where id = $1",
      [edited],
    );

    expect(await repository.lockUneditedByImport(f.b, importId, { limit: 10 })).toEqual([]);
    const page = await repository.lockUneditedByImport(f.a, importId, { limit: 1 });
    expect(page).toEqual([first]);
    expect(
      await repository.lockUneditedByImport(f.a, importId, { after: first, limit: 10 }),
    ).toEqual([second]);
    await repository.softDeleteAll(f.b, [first!], new Date());
    expect(await f.row('contacts', first!)).toMatchObject({ deleted_at: null });
    await repository.softDeleteAll(f.a, [first!, second!], new Date());
    expect(await repository.lockUneditedByImport(f.a, importId, { limit: 10 })).toEqual([]);
    expect((await f.row('contacts', second!)).deleted_at).not.toBeNull();
    expect((await f.row('contacts', edited!)).deleted_at).toBeNull();
  });
});
