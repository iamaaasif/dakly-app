import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import { MessageArchiveRepository } from './message-archive.repository';
import { MessageArchiveService, messageArchiveKey } from './message-archive.service';

class MemoryStorage {
  readonly objects = new Map<string, Uint8Array>();
  failWrites = false;

  async writeBytes(key: string, body: Uint8Array) {
    if (this.failWrites) throw new Error('R2 is down');
    this.objects.set(key, body);
  }

  async getObjectMetadata(key: string) {
    const body = this.objects.get(key);
    return body ? { contentType: 'application/gzip', sizeBytes: body.byteLength } : null;
  }
}

describe('message archive (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  const storage = new MemoryStorage();
  // The app role is what runs in production, so row level security and grants apply.
  const app = createDatabase(process.env.DATABASE_URL!);
  const service = new MessageArchiveService(
    new MessageArchiveRepository(new TenantDatabase(app.db)),
    storage as unknown as FileStorageDriver,
  );
  const identities = new Map<string, string>();
  const contactIds: string[] = [];
  const connectionIds: string[] = [];
  const first = randomUUID();
  const second = randomUUID();
  const other = randomUUID();

  async function conversation(storeId: string, id: string) {
    const contactId = randomUUID();
    const connectionId = randomUUID();
    contactIds.push(contactId);
    connectionIds.push(connectionId);
    await owner.query(
      "insert into contacts (id, store_id, source, kind) values ($1, $2, 'messenger', 'chat_only')",
      [contactId, storeId],
    );
    await owner.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $1::text, 'Archive fixture')`,
      [connectionId, storeId],
    );
    await owner.query(
      `insert into conversations (id, store_id, contact_id, channel_connection_id, channel)
       values ($1, $2, $3, $4, 'messenger')`,
      [id, storeId, contactId, connectionId],
    );
    const identityId = randomUUID();
    identities.set(id, identityId);
    await owner.query(
      `insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id)
       values ($1::uuid, $2, $3, $4, 'messenger', $1::text)`,
      [identityId, storeId, contactId, connectionId],
    );
  }

  async function message(storeId: string, conversationId: string, body: string, createdAt: string) {
    await owner.query(
      `insert into messages (id, store_id, conversation_id, direction, author_type, kind, status, body, created_at, sender_identity_id)
       values ($1, $2, $3, 'in', 'customer', 'text', 'received', $4, $5, $6)`,
      [randomUUID(), storeId, conversationId, body, createdAt, identities.get(conversationId)],
    );
  }

  const remaining = async (storeId: string) =>
    (
      await owner.query('select count(*)::int as total from messages where store_id = $1', [
        storeId,
      ])
    ).rows[0].total as number;
  const lines = (storeId: string, conversationId: string, month: string) =>
    gunzipSync(storage.objects.get(messageArchiveKey(storeId, { conversationId, month }))!)
      .toString()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { body: string });

  beforeAll(async () => {
    await fixture.setup();
    await conversation(fixture.a, first);
    await conversation(fixture.a, second);
    await conversation(fixture.b, other);
    await message(fixture.a, first, 'ডেলিভারি চার্জ কত?', '2015-06-03T04:00:00Z');
    await message(fixture.a, first, '১২০ টাকা', '2015-06-03T04:05:00Z');
    await message(fixture.a, first, 'ধন্যবাদ', '2015-07-01T04:00:00Z');
    await message(fixture.a, second, 'অর্ডার দেব', '2015-06-20T04:00:00Z');
    await message(fixture.a, first, 'নতুন বার্তা', new Date().toISOString());
    await message(fixture.b, other, 'অন্য দোকান', '2015-06-03T04:00:00Z');
  });
  afterAll(async () => {
    await owner.query('delete from messages where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from conversations where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from contact_identities where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from channel_connections where id = any($1::uuid[])', [
      connectionIds,
    ]);
    await owner.query('delete from contacts where id = any($1::uuid[])', [contactIds]);
    await Promise.all([fixture.close(), app.pool.end()]);
  });

  it('keeps every message when the export fails', async () => {
    storage.failWrites = true;
    await expect(service.archiveExpired(fixture.a)).rejects.toThrow('R2 is down');
    storage.failWrites = false;
    expect(await remaining(fixture.a)).toBe(5);
  });

  it('writes one object per conversation and month, then deletes only those rows', async () => {
    await service.archiveExpired(fixture.a);

    expect(lines(fixture.a, first, '2015-06').map(({ body }) => body)).toEqual([
      'ডেলিভারি চার্জ কত?',
      '১২০ টাকা',
    ]);
    expect(lines(fixture.a, first, '2015-07').map(({ body }) => body)).toEqual(['ধন্যবাদ']);
    expect(lines(fixture.a, second, '2015-06')).toHaveLength(1);
    expect(storage.objects.size).toBe(3);
    expect(await remaining(fixture.a)).toBe(1);
    expect(await remaining(fixture.b)).toBe(1);
  });

  it('does nothing on a rerun', async () => {
    const before = [...storage.objects.keys()];
    await service.archiveExpired(fixture.a);
    expect([...storage.objects.keys()]).toEqual(before);
    expect(await remaining(fixture.a)).toBe(1);
  });
});
