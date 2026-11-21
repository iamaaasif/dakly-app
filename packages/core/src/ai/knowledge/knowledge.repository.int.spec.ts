import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { knowledgeFileBytes } from '@dakly/contracts/knowledge';
import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';
import { LlmError } from '@dakly/providers/llm/llm-driver';

import { OwnerIsolationFixture } from '../../../test/owner-isolation-fixture';
import { newId } from '../../platform/database/new-id';
import { TenantDatabase } from '../../platform/database/tenant-database';
import type { AiService } from '../ai.service';
import { IndexKnowledgeJob } from './jobs/index-knowledge.job';
import { KnowledgeIndexService } from './knowledge-index.service';
import { KnowledgeRepository, type KnowledgeItem } from './knowledge.repository';

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

    await runIndex(indexer, item);
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

    await runIndex(indexer, item);
    expect(await chunksFor(item.id)).toEqual(chunks);
  });

  it.each([
    ['text/plain', Buffer.from('a'.repeat(200_001)), 'knowledge_file_text_limit'],
    ['application/pdf', pdfWithText(101, 'Dhaka'), 'knowledge_file_page_limit'],
    ['application/pdf', pdfWithText(1, 'a'.repeat(200_001)), 'knowledge_file_text_limit'],
    ['application/pdf', Buffer.from('Invalid PDF'), 'knowledge_file_invalid'],
  ] as const)(
    'rejects a %s that fails validation with no partial chunks',
    async (type, bytes, reason) => {
      const item = await createFile(type, bytes);
      await runIndex(withFile(bytes), item);
      await expectRejected(item, reason);
    },
  );

  it('embeds at most 64 chunks per request and keeps all measured tokens', async () => {
    const bytes = Buffer.from('a'.repeat(63 * 2000) + 'b'.repeat(2000) + 'ঢাকা');
    const item = await createFile('text/plain', bytes);
    await runIndex(withFile(bytes, [71, 8]), item);
    const chunks = await chunksFor(item.id);
    expect(chunks).toHaveLength(65);
    expect(
      chunks.filter((chunk) => chunk.content.startsWith('a') && chunk.token_count === 1),
    ).toHaveLength(63);
    expect(chunks).toEqual(
      expect.arrayContaining([
        { content: 'b'.repeat(2000), token_count: 8 },
        { content: 'ঢাকা', token_count: 8 },
      ]),
    );
  });

  it('apportions the measured total by UTF-8 bytes', async () => {
    const bytes = Buffer.from('a'.repeat(2000) + 'ঢাকা'.repeat(25));
    const item = await createFile('text/plain', bytes);
    await runIndex(withFile(bytes), item);
    expect(await chunksFor(item.id)).toEqual(
      expect.arrayContaining([
        { content: 'a'.repeat(2000), token_count: 6 },
        { content: 'ঢাকা'.repeat(25), token_count: 2 },
      ]),
    );
  });

  it('keeps a file retryable when the last indexing attempt meets an AI error', async () => {
    const bytes = Buffer.from('ঢাকায় ডেলিভারি ৬০ টাকা।');
    const item = await createFile('text/plain', bytes);
    const storage = {
      async readBytes() {
        return { kind: 'found', bytes };
      },
    } as FileStorageDriver;
    const ai = {
      async embed() {
        throw new LlmError('LLM_UNAVAILABLE');
      },
    } as AiService;
    const job = new IndexKnowledgeJob(new KnowledgeIndexService(repository, storage, ai));
    const event = {
      id: newId(),
      storeId: fixture.a,
      type: 'knowledge.index_requested',
      occurredAt: now.toISOString(),
      payload: { knowledgeItemId: item.id },
    };

    await expect(job.handle(event, false)).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      status: 'processing',
    });
    await expect(job.handle(event, true)).resolves.toBeUndefined();
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      status: 'failed',
      factsCount: 0,
    });
    expect(await chunksFor(item.id)).toEqual([]);
    await expect(repository.findFile(fixture.a, item.fileId!)).resolves.toMatchObject({
      status: 'pending',
    });
    const { rows } = await fixture.connection.pool.query('select sha256 from files where id=$1', [
      item.fileId,
    ]);
    expect(rows).toEqual([{ sha256: createHash('sha256').update(bytes).digest() }]);
  });

  it('leaves a new revision processing when an older final attempt is delivered', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      {
        kind: 'policy',
        answer: 'আগের তথ্য',
      },
      now,
    );
    const changed = await repository.change(fixture.a, item.id, { answer: 'নতুন তথ্য' }, now);
    const indexer = withFile(Buffer.alloc(0), []);
    await expect(runIndex(indexer, item, true)).resolves.toBeUndefined();
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject(changed!);
  });

  it('keeps the question and keywords and reads the name of a file', async () => {
    const answer = await repository.create(
      fixture.a,
      fixture.userA,
      {
        kind: 'policy',
        question: 'Showroom kothay?',
        answer: 'House 12, Road 5.',
        keywords: ['showroom', 'dokan'],
      },
      now,
    );
    const id = newId();
    await repository.createFile(fixture.a, {
      id,
      fileName: 'Size chart.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      objectKey: `stores/${fixture.a}/knowledge/${id}`,
      uploadedByUserId: fixture.userA,
      createdAt: now,
    });
    const file = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'file', fileId: id },
      now,
    );

    await expect(repository.find(fixture.a, answer.id)).resolves.toMatchObject({
      question: 'Showroom kothay?',
      keywords: ['showroom', 'dokan'],
      timesUsed: 0,
      fileName: null,
    });
    await expect(repository.find(fixture.a, file.id)).resolves.toMatchObject({
      fileName: 'Size chart.pdf',
    });
    const listed = await repository.list(fixture.a, { limit: 100 });
    expect(listed.find((item) => item.id === file.id)?.fileName).toBe('Size chart.pdf');
  });

  it('counts a use for the store that owns the answer and leaves the revision alone', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', answer: 'Open 10 to 10.' },
      now,
    );
    await repository.recordUse(fixture.b, [item.id]);
    await repository.recordUse(fixture.a, [item.id]);
    await repository.recordUse(fixture.a, [item.id]);
    await repository.recordUse(fixture.a, []);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      timesUsed: 2,
      updatedAt: item.updatedAt,
    });
  });

  it('indexes the question and keywords with the answer', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', question: 'Showroom kothay?', answer: 'House 12.', keywords: ['dokan'] },
      now,
    );
    const embedded: string[][] = [];
    const ai = {
      async embed(_store: string, inputs: readonly string[]) {
        embedded.push([...inputs]);
        return {
          embeddings: inputs.map(() => Array.from({ length: 512 }, () => 0.5)),
          model: 'test-model',
          usage: { inputTokens: 4, cachedInputTokens: 0, outputTokens: 0 },
        };
      },
    } as unknown as AiService;
    await runIndex(new KnowledgeIndexService(repository, {} as FileStorageDriver, ai), item);
    expect(embedded).toEqual([['Showroom kothay?\nHouse 12.\nKeywords: dokan']]);
  });

  it('rejects oversized file metadata before reading the object', async () => {
    const item = await createFile('text/plain', Buffer.alloc(0), knowledgeFileBytes + 1);
    const indexer = new KnowledgeIndexService(repository, {} as FileStorageDriver, {} as AiService);
    await runIndex(indexer, item);
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

  function runIndex(indexer: KnowledgeIndexService, item: KnowledgeItem, finalAttempt = false) {
    return indexer.index(fixture.a, item.id, {
      revision: item.updatedAt.toISOString(),
      finalAttempt,
    });
  }

  function withFile(bytes: Uint8Array, measuredTokens = [8]) {
    const ai = {
      async embed(_tenant: string, inputs: readonly string[]) {
        const inputTokens = measuredTokens.shift();
        if (inputTokens === undefined || inputs.length > 64)
          throw new Error('Unexpected embedding request');
        return {
          embeddings: inputs.map(() =>
            Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0)),
          ),
          model: 'test-embedding',
          usage: { inputTokens, cachedInputTokens: 0, outputTokens: 0 },
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
    const { rows } = await fixture.connection.pool.query<{ content: string; token_count: number }>(
      'select content, token_count from knowledge_chunks where knowledge_item_id=$1',
      [id],
    );
    return rows;
  }

  it('keeps the selected revision when indexing finishes before its clock', async () => {
    const revisedAt = new Date('2099-01-01T00:00:00Z');
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', answer: 'নতুন তথ্য' },
      revisedAt,
    );
    await expect(
      repository.finishIndex(fixture.a, item.id, revisedAt, {
        chunks: [],
      }),
    ).resolves.toBe(true);
    await expect(repository.find(fixture.a, item.id)).resolves.toMatchObject({
      updatedAt: revisedAt,
      status: 'failed',
    });
    const changed = await repository.change(fixture.a, item.id, { answer: 'পরের তথ্য' }, now);
    expect(changed?.updatedAt.getTime()).toBeGreaterThan(revisedAt.getTime());
  });

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
    const answer = 'জ\u09df delivery';
    const query = 'জয\u09bc';
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
    const matching = await create(fixture.a, answer, farther, 'current');
    await create(fixture.a, answer, closer, 'old');
    await create(fixture.b, answer, closer, 'current');
    const edited = await create(fixture.a, answer, closer, 'current');
    await repository.change(fixture.a, edited, { answer: 'নতুন মূল্য' }, now);

    const rejected = await createFile('text/plain', Buffer.from('ঢাকা'));
    await repository.finishIndex(fixture.a, rejected.id, rejected.updatedAt, {
      chunks: [{ content: 'ঢাকা', embedding: closer, embeddingModel: 'current', tokenCount: 5 }],
    });
    await fixture.connection.pool.query("update files set status='rejected' where id=$1", [
      rejected.fileId,
    ]);

    const hits = await repository.search(fixture.a, {
      query,
      embedding,
      model: 'current',
      limit: 10,
    });
    expect(hits.map((hit) => hit.itemId)).toEqual([matching, closest]);
    expect(hits[0]?.content).toBe(answer);
  });
});

function pdfWithText(pages: number, text: string): Buffer {
  const refs = Array.from({ length: pages }, (_, index) => `${index + 5} 0 R`);
  const lines = text.match(/.{1,80}/g) ?? [];
  const pageHeight = Math.max(792, lines.length * 3 + 144);
  const commands = lines.map((line) => `(${line}) Tj 0 -3 Td`).join(' ');
  const stream = deflateSync(`BT /F1 2 Tf 72 ${pageHeight - 72} Td ${commands} ET`);
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
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
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
