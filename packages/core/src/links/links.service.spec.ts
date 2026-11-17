import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsentService } from '../consents/consent.service';
import type { RateLimiter } from '../platform/cache/rate-limiter';
import type { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { resetEnvForTests } from '../platform/config/env';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { LinksRepository, NewTrackedLinkRow } from './links.repository';
import { type NewTrackedLink, LinksService } from './links.service';

const STORE_ID = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const system = { kind: 'system' } as const;
const source = {
  sourceType: 'campaign',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007ae0',
} as const;
const links: NewTrackedLink[] = [
  {
    ...source,
    kind: 'redirect',
    targetUrl: 'https://rinar-dokan.example.test/sale',
    contactId: null,
  },
  { ...source, kind: 'sms_opt_out', contactId: '019c01ea-cf15-7d31-a7f5-d73d66007ad8' },
];

// The fake keeps the codes it holds and skips a row as the database does on a taken code.
function serviceWith(isTaken: (row: NewTrackedLinkRow, attempt: number) => boolean) {
  const saved: NewTrackedLinkRow[] = [];
  let attempt = 0;
  const repository = {
    insert: async (_storeId: string, rows: NewTrackedLinkRow[]) => {
      attempt++;
      const inserted = rows.filter((row) => !isTaken(row, attempt));
      saved.push(...inserted.map((row) => ({ ...row })));
      return inserted.map((row) => row.id);
    },
  };
  const service = new LinksService(
    repository as unknown as LinksRepository,
    {} as ConsentService,
    {} as StoreTransaction,
    {} as OutboxService,
    {} as RateLimiter,
    {} as ValkeyClient,
    new Clock(),
  );
  return { service, saved };
}

describe('LinksService', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('SHORT_LINK_BASE_URL', 'https://links.dakly.test');
    resetEnvForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it('gives a row that lost its code a new one and returns every link in order', async () => {
    const { service, saved } = serviceWith(
      (row, attempt) => attempt === 1 && row.kind === 'redirect',
    );

    const created = await service.create(STORE_ID, links, system);

    expect(saved.map((row) => row.kind)).toEqual(['sms_opt_out', 'redirect']);
    expect(created).toEqual([
      {
        id: saved[1]!.id,
        code: saved[1]!.code,
        url: `https://links.dakly.test/${saved[1]!.code}`,
      },
      {
        id: saved[0]!.id,
        code: saved[0]!.code,
        url: `https://links.dakly.test/s/${saved[0]!.code}`,
      },
    ]);
    expect(saved.every((row) => /^[0-9A-Za-z]{8}$/.test(row.code))).toBe(true);
  });

  it('builds the same opt-out address again from a kept code', async () => {
    const { service } = serviceWith(() => false);
    const [, optOut] = await service.create(STORE_ID, links, system);

    expect(service.optOutUrl(optOut!.code)).toBe(optOut!.url);
  });

  it('gives up when every code it tries is taken', async () => {
    const { service, saved } = serviceWith(() => true);

    await expect(service.create(STORE_ID, links, system)).rejects.toMatchObject({
      code: 'LINK_CODES_EXHAUSTED',
    });
    expect(saved).toEqual([]);
  });
});
