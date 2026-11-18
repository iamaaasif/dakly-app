import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../../test/owner-isolation-fixture';
import { loadEnv } from '../../platform/config/env';
import { DatabaseModule } from '../../platform/database/database.module';
import { KnowledgeIndexModule } from './knowledge-index.module';
import { KnowledgeSearchService } from './knowledge-search.service';

const workerSearch = Symbol('workerSearch');
class KnowledgeWorkerTestModule {}
Module({
  imports: [DatabaseModule, KnowledgeIndexModule],
  providers: [{ provide: workerSearch, useExisting: KnowledgeSearchService }],
})(KnowledgeWorkerTestModule);

describe('worker knowledge search', () => {
  const fixture = new OwnerIsolationFixture();
  let worker: INestApplicationContext;

  beforeAll(async () => {
    vi.stubEnv('LLM_DRIVER', 'fake');
    vi.stubEnv('QUEUE_PREFIX', `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`);
    await fixture.setup();
    worker = await NestFactory.createApplicationContext(KnowledgeWorkerTestModule, {
      logger: false,
      abortOnError: false,
    });
  });

  afterAll(async () => {
    await worker?.close();
    await fixture.connection.pool.query('delete from ai_runs where store_id=$1', [fixture.a]);
    await fixture.close();
    vi.unstubAllEnvs();
  });

  it('searches an empty store through the worker module with the fake model', async () => {
    const service = worker.get<KnowledgeSearchService>(workerSearch);
    await expect(service.search(fixture.a, 'ঢাকা', 3)).resolves.toEqual([]);
  });
});
