import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../../test/owner-isolation-fixture';
import { newId } from '../../platform/database/new-id';
import { KnowledgeRepository } from './knowledge.repository';

describe('KnowledgeRepository owner filters', () => {
  const fixture = new OwnerIsolationFixture();
  const repository = new KnowledgeRepository(fixture.tenant);
  const now = new Date('2026-11-18T15:00:00Z');

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    await fixture.connection.pool.query(
      'delete from knowledge_items where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.close();
  });

  it('filters item and file reads and item writes even on the table owner connection', async () => {
    const fileId = newId();
    await repository.createFile(fixture.a, {
      id: fileId,
      objectKey: `stores/${fixture.a}/knowledge/${fileId}`,
      contentType: 'text/plain',
      sizeBytes: 10,
      uploadedByUserId: fixture.userA,
      createdAt: now,
    });
    const item = await repository.create(fixture.a, fixture.userA, { kind: 'file', fileId }, now);

    await expect(repository.find(fixture.b, item.id)).resolves.toBeUndefined();
    await expect(repository.findFile(fixture.b, fileId)).resolves.toBeUndefined();
    await expect(repository.list(fixture.b, { limit: 10 })).resolves.toEqual([]);
    await expect(repository.change(fixture.b, item.id, { fileId }, now)).resolves.toBeUndefined();
    await expect(repository.remove(fixture.b, item.id)).resolves.toBe(false);
    await expect(repository.find(fixture.a, item.id)).resolves.toEqual(item);
    await expect(repository.findFile(fixture.a, fileId)).resolves.toMatchObject({
      status: 'pending',
    });
  });
  it('refuses cross-store index writes before row security', async () => {
    const item = await repository.create(
      fixture.a,
      fixture.userA,
      { kind: 'policy', answer: 'ঢাকা ডেলিভারি' },
      now,
    );
    const embedding = Array.from({ length: 512 }, () => 0.5);
    const chunks = [
      {
        content: 'ঢাকা ডেলিভারি',
        embedding,
        embeddingModel: 'test-model',
        tokenCount: 4,
      },
    ];
    await expect(
      repository.finishIndex(fixture.b, item.id, item.updatedAt, { chunks }),
    ).resolves.toBe(false);
    await expect(
      repository.finishIndex(fixture.a, item.id, item.updatedAt, { chunks }),
    ).resolves.toBe(true);
  });
});
