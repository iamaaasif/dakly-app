import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactImportRow, ImportConsentEvidence } from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { ConsentService } from '../consents/consent.service';
import type { ContactsService, ImportedContact } from '../contacts/contacts.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { Import, ImportCounts, ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const IMPORT_ID = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const USER_ID = '0b8f3c1e-5d2a-4f6b-9c7e-1a2b3c4d5e6f';

type Finished = { status: string; counts?: ImportCounts; reportKey?: string };

describe('ImportsService', () => {
  const objects = new Map<string, string>();
  const withdrawnPhones = new Set<string>();
  const knownPhones = new Set<string>();
  let found: Import | undefined;
  let finished: Finished | undefined;
  let granted: { channel: string; contactIds: string[] }[];
  let service: ImportsService;

  const repository = {
    findById: async () => found,
    saveProgress: async () => undefined,
    finish: async (
      _storeId: string,
      _importId: string,
      result: Finished,
      report?: { objectKey: string },
    ) => {
      finished = { ...result, reportKey: report?.objectKey };
    },
  };
  const contacts = {
    saveImportedRows: async (
      _storeId: string,
      _importId: string,
      rows: ContactImportRow[],
      duplicateMode: string,
    ): Promise<ImportedContact[]> =>
      rows.map(({ phone }) => {
        const existing = duplicateMode === 'skip' ? 'skipped' : 'updated';
        return {
          contactId: `contact-${phone}`,
          phone,
          outcome: knownPhones.has(phone) ? existing : 'added',
        };
      }),
  };
  const consents = {
    grantFromImport: async (_storeId: string, grant: { contactIds: string[]; channel: string }) => {
      granted.push(grant);
      const withdrawnContactIds = grant.contactIds.filter(
        (id) => grant.channel === 'sms' && withdrawnPhones.has(id.replace('contact-', '')),
      );
      return { withdrawnContactIds };
    },
  };
  const storage: FileStorageDriver = {
    createUploadUrl: (key) => `https://files.test/put/${key}`,
    createDownloadUrl: (key) => `https://files.test/get/${key}`,
    readText: async (key, maxBytes) => {
      const text = objects.get(key);
      if (text === undefined) return { kind: 'missing' };
      return Buffer.byteLength(text) > maxBytes ? { kind: 'too_large' } : { kind: 'found', text };
    },
    writeText: async (key, body) => {
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
      uploadKey: 'stores/x/imports/upload.csv',
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
    withdrawnPhones.clear();
    knownPhones.clear();
    finished = undefined;
    granted = [];
    service = new ImportsService(
      repository as unknown as ImportsRepository,
      contacts as unknown as ContactsService,
      consents as unknown as ConsentService,
      { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
      { publish: vi.fn() } as unknown as OutboxService,
      { now: () => new Date('2026-11-17T04:30:00Z') } as Clock,
      storage,
    );
  });

  it('counts added, updated and failed rows and grants only the channels with evidence', async () => {
    importing({ sms: 'দোকানের খাতায় সই' });
    knownPhones.add('01812345678');
    objects.set(
      'stores/x/imports/upload.csv',
      'Name,Mobile\nরাবেয়া,01712345678\nকরিম,01812345678\nসুমি,0171',
    );

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished).toMatchObject({
      status: 'done',
      counts: { rowsTotal: 3, rowsAdded: 1, rowsUpdated: 1, rowsSkipped: 0, rowsFailed: 1 },
    });
    expect(granted.map((grant) => grant.channel)).toEqual(['sms']);
    expect(objects.get(finished!.reportKey!)).toMatch(/^Row,Field,Problem\r\n"4","phone",/);
  });

  it('reports a withdrawn channel on its row and leaves skipped contacts out of consent', async () => {
    importing({ sms: 'দোকানের খাতায় সই', whatsapp: 'চেকআউটে রাজি' }, 'skip');
    withdrawnPhones.add('01712345678');
    knownPhones.add('01812345678');
    objects.set('stores/x/imports/upload.csv', 'Name,Mobile\nরাবেয়া,01712345678\nকরিম,01812345678');

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished?.counts).toMatchObject({ rowsAdded: 1, rowsSkipped: 1 });
    expect(granted.map((grant) => grant.contactIds)).toEqual([
      ['contact-01712345678'],
      ['contact-01712345678'],
    ]);
    expect(objects.get(finished!.reportKey!)).toBe(
      'Row,Field,Problem\r\n"2","sms","This customer said no to SMS messages, so the import did not change that"\r\n',
    );
  });

  it('finishes with no report when every row imports', async () => {
    importing({});
    objects.set('stores/x/imports/upload.csv', 'Name,Mobile\nরাবেয়া,01712345678');

    await service.runCustomerImport(STORE_ID, IMPORT_ID);

    expect(finished).toMatchObject({ status: 'done', reportKey: undefined });
    expect(granted).toEqual([]);
  });

  it.each([
    ['an unreadable file', 'Mobile\n017"12345678', 'not a readable CSV'],
    ['a file that never arrived', undefined, 'The file was not uploaded'],
    ['a file over 10 MB', `Mobile\n${'01712345678\n'.repeat(1_000_000)}`, 'at most 10 MB'],
  ])('fails the import for %s and says why in the report', async (_case, file, reason) => {
    importing({});
    if (file) objects.set('stores/x/imports/upload.csv', file);

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

  it('answers a missing import with IMPORT_NOT_FOUND', async () => {
    found = undefined;

    await expect(service.get(STORE_ID, IMPORT_ID)).rejects.toMatchObject({
      code: 'IMPORT_NOT_FOUND',
    });
  });
});
