import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactImportRow, ImportConsentEvidence } from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { ConsentService } from '../consents/consent.service';
import type { ContactsService, ImportedContact } from '../contacts/contacts.service';
import type { RateLimiter } from '../platform/cache/rate-limiter';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { Import, ImportResult, ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const IMPORT_ID = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const USER_ID = '0b8f3c1e-5d2a-4f6b-9c7e-1a2b3c4d5e6f';
const UPLOAD = 'imports/x/upload.csv';

type Answer = 'granted' | 'withdrawn';

// In-memory stand-ins that keep state, so each test reads the result rather than the calls.
describe('ImportsService', () => {
  const objects = new Map<string, string>();
  const knownPhones = new Set<string>();
  const consent = new Map<string, Answer>();
  let found: Import | undefined;
  let lease: Date | null;
  let finished: (ImportResult & { reportKey?: string }) | undefined;
  let failBatch: boolean;
  let failReport: boolean;
  let service: ImportsService;

  const repository = {
    findById: async () => found,
    claim: async (_s: string, _i: string, now: Date, staleBefore: Date) => {
      if (lease && lease >= staleBefore) return false;
      lease = now;
      return true;
    },
    releaseClaim: async () => {
      lease = null;
    },
    markUploadReady: async () => undefined,
    saveProgress: async (_s: string, _i: string, _c: unknown, held: { renewed: Date }) => {
      lease = held.renewed;
      return true;
    },
    finish: async (
      _s: string,
      _i: string,
      { result, report }: { result: ImportResult; report?: { objectKey: string } },
    ) => {
      finished = { ...result, reportKey: report?.objectKey };
      lease = null;
      return true;
    },
  };
  const contacts = {
    saveImportedRows: async (
      _storeId: string,
      _importId: string,
      rows: ContactImportRow[],
      duplicateMode: string,
    ): Promise<ImportedContact[]> => {
      if (failBatch) throw new Error('Database connection lost');
      return rows.map(({ phone }) => {
        const existing = duplicateMode === 'skip' ? 'skipped' : 'updated';
        return {
          contactId: `contact-${phone}`,
          phone,
          outcome: knownPhones.has(phone) ? existing : 'added',
          notChanged: [],
        };
      });
    },
  };
  const consents = {
    grantFromImport: async (_storeId: string, grant: { contactIds: string[]; channel: string }) => {
      const withdrawnContactIds: string[] = [];
      for (const contactId of grant.contactIds) {
        const key = `${contactId}:${grant.channel}`;
        if (consent.get(key) === 'withdrawn') withdrawnContactIds.push(contactId);
        if (!consent.has(key)) consent.set(key, 'granted');
      }
      return { withdrawnContactIds };
    },
  };
  const storage: FileStorageDriver = {
    createUploadUrl: (key) => `https://files.test/put/${key}`,
    createDownloadUrl: (key) => `https://files.test/get/${key}`,
    readBytes: async (key, maxBytes) => {
      const text = objects.get(key);
      if (text === undefined) return { kind: 'missing' };
      const bytes = Buffer.from(text);
      return bytes.byteLength > maxBytes ? { kind: 'too_large' } : { kind: 'found', bytes };
    },
    writeText: async (key, body) => {
      if (failReport) throw new Error('Storage unavailable');
      objects.set(key, body);
    },
  };

  function importing(
    consentEvidence: ImportConsentEvidence,
    duplicateMode: 'update' | 'skip' = 'update',
  ) {
    found = {
      id: IMPORT_ID,
      status: 'importing',
      columnMapping: { name: 0, phone: 1 },
      duplicateMode,
      consentEvidence,
      createdByUserId: USER_ID,
      uploadFileId: '019c01ea-cf15-7d31-a7f5-d73d66007ad8',
      uploadKey: UPLOAD,
      reportKey: null,
      rowsTotal: null,
      rowsAdded: null,
      rowsUpdated: null,
      rowsSkipped: null,
      rowsFailed: null,
    };
  }

  beforeEach(() => {
    objects.clear();
    knownPhones.clear();
    consent.clear();
    lease = null;
    finished = undefined;
    failBatch = false;
    service = new ImportsService(
      repository as unknown as ImportsRepository,
      contacts as unknown as ContactsService,
      consents as unknown as ConsentService,
      { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
      { publish: vi.fn() } as unknown as OutboxService,
      { now: () => new Date('2026-11-17T04:30:00Z') } as Clock,
      storage,
      { consume: async () => ({ allowed: true, retryAfter: 0 }) } as unknown as RateLimiter,
    );
  });

  it('counts added, updated and failed rows and grants only the channels with evidence', async () => {
    importing({ sms: 'দোকানের খাতায় সই' });
    knownPhones.add('01812345678');
    objects.set(UPLOAD, 'Name,Mobile\nরাবেয়া,01712345678\nকরিম,01812345678\nসুমি,0171');

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished).toMatchObject({
      status: 'done',
      counts: { rowsTotal: 3, rowsAdded: 1, rowsUpdated: 1, rowsSkipped: 0, rowsFailed: 1 },
    });
    expect(Object.fromEntries(consent)).toEqual({
      'contact-01712345678:sms': 'granted',
      'contact-01812345678:sms': 'granted',
    });
    expect(objects.get(finished!.reportKey!)).toMatch(/^Row,Field,Problem\r\n"4","Phone",/);
  });

  it('reports a withdrawn channel on its row and leaves skipped contacts out of consent', async () => {
    importing({ sms: 'দোকানের খাতায় সই', whatsapp: 'চেকআউটে রাজি' }, 'skip');
    consent.set('contact-01712345678:sms', 'withdrawn');
    knownPhones.add('01812345678');
    objects.set(UPLOAD, 'Name,Mobile\nরাবেয়া,01712345678\nকরিম,01812345678');

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished?.counts).toMatchObject({ rowsAdded: 1, rowsSkipped: 1 });
    expect(Object.fromEntries(consent)).toEqual({
      'contact-01712345678:sms': 'withdrawn',
      'contact-01712345678:whatsapp': 'granted',
    });
    expect(objects.get(finished!.reportKey!)).toBe(
      'Row,Field,Problem\r\n"2","SMS","This customer said no to SMS messages, so the import did not change that"\r\n',
    );
  });

  it('finishes with no report and no consent when every row imports without evidence', async () => {
    importing({});
    objects.set(UPLOAD, 'Name,Mobile\nরাবেয়া,01712345678');

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished).toMatchObject({ status: 'done', reportKey: undefined });
    expect(consent.size).toBe(0);
  });

  it.each([
    ['an unreadable file', 'Mobile\n017"12345678', 'not a readable CSV'],
    ['a file that never arrived', undefined, 'The file was not uploaded'],
    ['a file over 10 MB', `Mobile\n${'01712345678\n'.repeat(1_000_000)}`, 'at most 10 MB'],
  ])('fails the import for %s and says why in the report', async (_case, file, reason) => {
    importing({});
    if (file) objects.set(UPLOAD, file);

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished?.status).toBe('failed');
    expect(objects.get(finished!.reportKey!)).toContain(reason);
  });

  it('leaves an import that is not running alone', async () => {
    importing({});
    found = { ...found!, status: 'done' };

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished).toBeUndefined();
  });

  it('fails while another run holds a fresh lease and takes the import over once it is stale', async () => {
    importing({});
    objects.set(UPLOAD, 'Name,Mobile\nরাবেয়া,01712345678');
    lease = new Date('2026-11-17T04:28:00Z');

    await expect(service.runCustomerImport(STORE_ID, IMPORT_ID)).rejects.toMatchObject({
      code: 'IMPORT_BEING_RUN',
    });
    expect(finished).toBeUndefined();

    lease = new Date('2026-11-17T04:20:00Z');
    await service.runCustomerImport(STORE_ID, IMPORT_ID);
    expect(finished?.status).toBe('done');
  });

  it('lets go of its lease when a batch fails, so the retry runs at once', async () => {
    importing({});
    objects.set(UPLOAD, 'Name,Mobile\nরাবেয়া,01712345678');
    failBatch = true;

    await expect(service.runCustomerImport(STORE_ID, IMPORT_ID)).rejects.toThrow();
    expect(lease).toBeNull();

    failBatch = false;
    await service.runCustomerImport(STORE_ID, IMPORT_ID);
    expect(finished?.counts).toMatchObject({ rowsAdded: 1 });
  });

  it('lets go of its lease when the report cannot be saved, so the retry finishes the import', async () => {
    importing({});
    objects.set(UPLOAD, 'Name,Mobile\nরাবেয়া,01712345678\nসুমি,0171');
    failReport = true;

    await expect(service.runCustomerImport(STORE_ID, IMPORT_ID)).rejects.toThrow();
    expect(finished).toBeUndefined();
    expect(lease).toBeNull();

    failReport = false;
    await service.runCustomerImport(STORE_ID, IMPORT_ID);
    expect(finished?.status).toBe('done');
  });

  it('answers a missing import with IMPORT_NOT_FOUND', async () => {
    found = undefined;

    await expect(service.get(STORE_ID, IMPORT_ID)).rejects.toMatchObject({
      code: 'IMPORT_NOT_FOUND',
    });
  });
});
