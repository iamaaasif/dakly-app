import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { knowledgeFileBytes } from '@dakly/contracts/knowledge';
import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../../test/owner-isolation-fixture';
import { newId } from '../../platform/database/new-id';
import { TenantDatabase } from '../../platform/database/tenant-database';
import type { AiService } from '../ai.service';
import { KnowledgeIndexService } from './knowledge-index.service';
import { KnowledgeRepository } from './knowledge.repository';

describe('KnowledgeRepository', () => {
  const fixture = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new KnowledgeRepository(new TenantDatabase(app.db));
  const now = new Date('2026-11-18T15:00:00Z');

  beforeAll(async () => fixture.setup());
  afterAll(async () => {
    await app.pool.end();
    await fixture.connection.pool.query(
      'delete from knowledge_items where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.connection.pool.query('delete from files where store_id=any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.close();
  });

  it('keeps text, reads and changes within the chosen store', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', answer: 'ঢাকায় ডেলিভারি ৬০ টাকা।' },
      now,
    );

    expect(await repository.find(fixture.b, item.id)).toBeUndefined();
    expect(await repository.list(fixture.b, { limit: 50 })).toEqual([]);
    expect(await repository.change(fixture.b, item.id, { answer: 'অন্যান্য' }, now)).toBeUndefined();
    expect(await repository.remove(fixture.b, item.id)).toBe(false);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      answer: 'ঢাকায় ডেলিভারি ৬০ টাকা।',
      status: 'processing',
    });
  });

  it.each([
    ['text/plain', 'ঢাকায় ডেলিভারি ৬০ টাকা।'],
    ['application/pdf', 'Delivery in Dhaka costs 60 taka.'],
  ] as const)('indexes a %s once and keeps its chunks in the store', async (type, text) => {
    const bytes = type === 'text/plain' ? Buffer.from(text) : pdfWithText(1, text);
    const item = await createFile(type, bytes);
    const indexer = withFile(bytes);

    await indexer.index(fixture.a, item.id);
    const { rows } = await fixture.connection.pool.query('select sha256 from files where id=$1', [
      item.fileId,
    ]);
    expect(rows).toEqual([{ sha256: createHash('sha256').update(bytes).digest() }]);
    const chunks = await chunksFor(item.id);
    expect(chunks).toEqual([{ content: text, token_count: 8 }]);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      status: 'active',
      factsCount: 1,
    });
    await expect(repository.findFile(fixture.a, item.fileId!)).resolves.toMatchObject({
      status: 'ready',
    });
    await expect(repository.findFile(fixture.b, item.fileId!)).resolves.toBeUndefined();

    await indexer.index(fixture.a, item.id);
    expect(await chunksFor(item.id)).toEqual(chunks);
  });

  it.each([
    ['text/plain', Buffer.from('a'.repeat(200_001)), 'knowledge_file_text_limit'],
    ['application/pdf', pdfWithText(101, 'Dhaka'), 'knowledge_file_page_limit'],
    ['application/pdf', pdfWithText(90, 'a'.repeat(2_500)), 'knowledge_file_text_limit'],
    ['application/pdf', Buffer.from('Invalid PDF'), 'knowledge_file_invalid'],
  ] as const)(
    'rejects a %s that fails validation with no partial chunks',
    async (type, bytes, reason) => {
      const item = await createFile(type, bytes);
      await withFile(bytes).index(fixture.a, item.id);
      await expectRejected(item, reason);
    },
  );

  it('rejects oversized file metadata before reading the object', async () => {
    const item = await createFile('text/plain', Buffer.alloc(0), knowledgeFileBytes + 1);
    const indexer = new KnowledgeIndexService(repository, {} as FileStorageDriver, {} as AiService);
    await indexer.index(fixture.a, item.id);
    await expectRejected(item, 'knowledge_file_size_limit');
  });

  async function expectRejected(item: { id: string; fileId: string | null }, reason: string) {
    expect(await chunksFor(item.id)).toEqual([]);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      status: 'failed',
      factsCount: 0,
    });
    const { rows } = await fixture.connection.pool.query(
      'select status, reject_reason from files where id=$1',
      [item.fileId],
    );
    expect(rows).toEqual([{ status: 'rejected', reject_reason: reason }]);
  }

  async function createFile(contentType: string, bytes: Uint8Array, sizeBytes = bytes.length) {
    const id = newId();
    await repository.createFile(fixture.a, {
      id,
      contentType,
      sizeBytes,
      objectKey: `stores/${fixture.a}/knowledge/${id}`,
      uploadedByUserId: fixture.userA,
      createdAt: now,
    });
    return repository.create(fixture.a, fixture.userA, { kind: 'file', fileId: id }, now);
  }

  function withFile(bytes: Uint8Array) {
    let remainingEmbeddings = 1;
    const ai = {
      async embed() {
        if (remainingEmbeddings-- <= 0) throw new Error('Unexpected embedding request');
        return {
          embedding: Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0)),
          model: 'test-embedding',
          usage: { inputTokens: 8, cachedInputTokens: 0, outputTokens: 0 },
        };
      },
    } as AiService;
    const storage = {
      async readBytes() {
        return { kind: 'found', bytes };
      },
    } as FileStorageDriver;
    return new KnowledgeIndexService(repository, storage, ai);
  }

  async function chunksFor(id: string) {
    const { rows } = await fixture.connection.pool.query(
      'select content, token_count from knowledge_chunks where knowledge_item_id=$1',
      [id],
    );
    return rows;
  }

  it('discards a completed index for an item changed after the indexing read', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', answer: 'আগের তথ্য' },
      now,
    );
    const changed = await repository.change(fixture.a, item.id, { answer: 'নতুন তথ্য' }, now);
    expect(changed?.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());

    const chunks = [
      {
        content: 'আগের তথ্য',
        embedding: Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0)),
        embeddingModel: 'test-embedding',
        tokenCount: 2,
      },
    ];
    await expect(
      repository.finishIndex(fixture.a, item.id, item.updatedAt, { chunks }),
    ).resolves.toBe(false);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      answer: 'নতুন তথ্য',
      factsCount: 0,
      status: 'processing',
    });
  });

  it('merges text and vector ranks without returning another store or embedding model', async () => {
    const embedding = [1, 0, ...Array.from({ length: 510 }, () => 0)];
    const closer = embedding;
    const farther = [0, 1, ...Array.from({ length: 510 }, () => 0)];
    const create = async (
      storeId: string,
      answer: string,
      vector: number[],
      embeddingModel: string,
    ) => {
      const item = await repository.create(storeId, fixture.userA, { kind: 'policy', answer }, now);
      await repository.finishIndex(storeId, item.id, item.updatedAt, {
        chunks: [
          {
            content: answer,
            embedding: vector,
            embeddingModel,
            tokenCount: 5,
          },
        ],
      });
      return item.id;
    };
    const closest = await create(fixture.a, 'Warranty and returns', closer, 'current');
    const matching = await create(fixture.a, 'ঢাকা delivery', farther, 'current');
    await create(fixture.a, 'ঢাকা delivery', closer, 'old');
    await create(fixture.b, 'ঢাকা delivery', closer, 'current');

    const rejected = await createFile('text/plain', Buffer.from('ঢাকা'));
    await repository.finishIndex(fixture.a, rejected.id, rejected.updatedAt, {
      chunks: [{ content: 'ঢাকা', embedding: closer, embeddingModel: 'current', tokenCount: 5 }],
    });
    await fixture.connection.pool.query("update files set status='rejected' where id=$1", [
      rejected.fileId,
    ]);

    const hits = await repository.search(fixture.a, {
      query: 'ঢাকা',
      embedding,
      model: 'current',
      limit: 10,
    });
    expect(hits.map((hit) => hit.itemId)).toEqual([matching, closest]);
    expect(hits[0]?.content).toBe('ঢাকা delivery');
  });
});

function pdfWithText(pages: number, text: string): Buffer {
  const refs = Array.from({ length: pages }, (_, index) => `${index + 5} 0 R`);
  const lines = text.match(/.{1,80}/g) ?? [];
  const commands = lines.map((line) => `(${line}) Tj 0 -10 Td`).join(' ');
  const stream = deflateSync(`BT /F1 8 Tf 72 720 Td ${commands} ET`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${refs.join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
      stream,
      Buffer.from('\nendstream'),
    ]),
    ...refs.map(
      () =>
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 3 0 R >> >> >>',
    ),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  let offset = parts[0]!.length;
  const xref = ['0000000000 65535 f '];
  for (const [index, object] of objects.entries()) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n `);
    const part = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      typeof object === 'string' ? Buffer.from(object) : object,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(part);
    offset += part.length;
  }
  parts.push(
    Buffer.from(
      `xref\n0 ${xref.length}\n${xref.join('\n')}\ntrailer\n<< /Root 1 0 R /Size ${xref.length} >>\nstartxref\n${offset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}
