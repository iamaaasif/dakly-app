import { beforeEach, describe, expect, it } from 'vitest';

import type { ImportConsentEvidence } from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { ConsentService } from '../consents/consent.service';
import type {
  ContactsService,
  ImportedContact,
  ImportContactBatch,
} from '../contacts/contacts.service';
import type { RateLimiter } from '../platform/cache/rate-limiter';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type {
  Import,
  ImportCheckpoint,
  ImportCounts,
  ImportResult,
  ImportsRepository,
} from './imports.repository';
import { ImportsService } from './imports.service';
import { UndoCustomerImport } from './undo-customer-import';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const IMPORT_ID = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const USER_ID = '0b8f3c1e-5d2a-4f6b-9c7e-1a2b3c4d5e6f';
const UPLOAD = 'imports/x/upload.csv';

type Answer = 'granted' | 'withdrawn';

// In-memory stand-ins that keep state, so each test reads the result rather than the calls.
describe('ImportsService', () => {
  const objects = new Map<string, string>();
  const knownPhones = new Set<string>();
  const phonesWithNotes = new Set<string>();
  const consent = new Map<string, Answer>();
  let found: Import | undefined;
  let lease: Date | null;
  let finished: (ImportResult & { reportKey?: string }) | undefined;
  let failBatch: boolean;
  let removed: string[];
  let published: string[];
  let pool: string[];
  let answers: { contactId: string; channel: string; status: string; source: string }[];
  let failReport: boolean;
  let service: ImportsService;

  const repository = {
    findById: async () => found,
    markUndone: async () => {
      if (found?.status !== 'done' && found?.status !== 'failed') return false;
      found = { ...found, status: 'undone' };
      return true;
    },
    renewUndoProgress: async () => undefined,
    markUndoFinished: async (_s: string, _i: string, at: Date) => {
      found = { ...found!, undoFinishedAt: at };
    },
    claim: async (_s: string, _i: string, now: Date, staleBefore: Date) => {
      if (lease && lease >= staleBefore) return false;
      lease = now;
      return true;
    },
    releaseClaim: async () => {
      lease = null;
    },
    markUploadReady: async () => undefined,
    saveProgress: async (
      _s: string,
      _i: string,
      counts: ImportCounts,
      held: { renewed: Date; checkpoint: ImportCheckpoint },
    ) => {
      Object.assign(found!, counts, { checkpoint: structuredClone(held.checkpoint) });
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
    lockUneditedByImport: async (
      _storeId: string,
      _importId: string,
      page: { after?: string; limit: number },
    ) => pool.filter((id) => !page.after || id > page.after).slice(0, page.limit),
    removeAll: async (_storeId: string, ids: string[]) => {
      removed.push(...ids);
      pool = pool.filter((id) => !ids.includes(id));
    },
    findImportMatches: async (_storeId: string, phones: string[]) =>
      phones
        .filter((phone) => knownPhones.has(phone))
        .map((phone) => ({
          id: `contact-${phone}`,
          phone,
          importId: null,
          whatsappPhone: null,
          tags: [],
        })),
    lockForConsent: async () => undefined,
    saveImportedRows: async (
      _storeId: string,
      _importId: string,
      { rows, duplicateMode }: ImportContactBatch,
    ): Promise<ImportedContact[]> => {
      if (failBatch) throw new Error('Database connection lost');
      return rows.map(({ phone }) => {
        const existing = duplicateMode === 'skip' ? 'skipped' : 'updated';
        return {
          contactId: `contact-${phone}`,
          phone,
          outcome: knownPhones.has(phone) ? existing : 'added',
          notChanged: phonesWithNotes.has(phone)
            ? [
                { field: 'tags', message: '1 tags not added: a customer has at most 50' },
                { field: 'whatsappPhone', message: 'WhatsApp number differs, not changed' },
              ]
            : [],
          hasWhatsappNumberMismatch: false,
        };
      });
    },
  };
  const consents = {
    restoreImportGrants: async () => {
      for (const answer of answers)
        if (answer.source === 'import' && answer.status === 'granted')
          answer.status = 'not_answered';
      return { complete: true };
    },
    currentForAudience: async (_storeId: string, ids: string[], channel?: string) =>
      ids.flatMap((contactId) => {
        const recorded = answers.filter(
          (item) =>
            (channel === undefined || item.channel === channel) && item.contactId === contactId,
        );
        if (recorded.length > 0) return recorded;
        const status = consent.get(`${contactId}:${channel}`);
        return status
          ? [{ contactId, status, source: 'manual', capturedAt: new Date('2026-11-17T04:30:00Z') }]
          : [];
      }),
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
    getObjectMetadata: async () => null,
    deleteObject: async (key) => {
      objects.delete(key);
    },
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
      finishedAt: null,
      undoFinishedAt: null,
      startedByUserId: USER_ID,
      checkpoint: null,
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
    phonesWithNotes.clear();
    consent.clear();
    lease = null;
    finished = undefined;
    failBatch = false;
    removed = [];
    published = [];
    pool = [];
    answers = [];
    service = new ImportsService(
      repository as unknown as ImportsRepository,
      contacts as unknown as ContactsService,
      consents as unknown as ConsentService,
      { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
      {
        publish: async (event: { type: string }) => void published.push(event.type),
      } as unknown as OutboxService,
      { now: () => new Date('2026-11-17T04:30:00Z') } as Clock,
      storage,
      { consume: async () => ({ allowed: true, retryAfter: 0 }) } as unknown as RateLimiter,
      new UndoCustomerImport(
        repository as unknown as ImportsRepository,
        contacts as unknown as ContactsService,
        consents as unknown as ConsentService,
        { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
        {
          publish: async (event: { type: string }) => void published.push(event.type),
        } as unknown as OutboxService,
        { now: () => new Date('2026-11-17T04:30:00Z') } as Clock,
      ),
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

  it('caps saved batch notes and resumes with the same complete report as an uninterrupted run', async () => {
    const phones = Array.from({ length: 6002 }, (_, index) => `017${10_000_000 + index}`);
    for (const phone of phones) {
      knownPhones.add(phone);
      phonesWithNotes.add(phone);
    }
    objects.set(
      UPLOAD,
      ['Name,Mobile', ...phones.map((phone) => `রাবেয়া,${phone}`), 'ভুল,0171'].join('\n'),
    );
    importing({});
    await service.runCustomerImport(STORE_ID, IMPORT_ID);
    const uninterrupted = objects.get(finished!.reportKey!)!;
    expect(found!.checkpoint!.report).toHaveLength(5000);
    expect(found!.checkpoint).toMatchObject({ processedRows: 6002, omittedRows: 3502 });
    expect(found!.checkpoint!.report.every((line) => line.field !== 'phone')).toBe(true);
    expect(uninterrupted).toContain('"6004","Phone",');
    expect(uninterrupted.endsWith('"","","3502 more rows had notes that are not listed"\r\n')).toBe(
      true,
    );

    importing({});
    finished = undefined;
    const save = contacts.saveImportedRows;
    let batches = 0;
    const interrupted = vi
      .spyOn(contacts, 'saveImportedRows')
      .mockImplementation(async (...args) => {
        if (++batches === 10) throw new Error('Worker stopped');
        return save(...args);
      });
    await expect(service.runCustomerImport(STORE_ID, IMPORT_ID)).rejects.toThrow('Worker stopped');
    expect(found!.checkpoint).toMatchObject({ processedRows: 4500, omittedRows: 2000 });
    expect(found!.checkpoint!.report).toHaveLength(5000);
    interrupted.mockRestore();
    await service.runCustomerImport(STORE_ID, IMPORT_ID);
    expect(objects.get(finished!.reportKey!)).toBe(uninterrupted);
    expect(finished!.counts).toMatchObject({ rowsUpdated: 6002, rowsFailed: 1 });
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

  describe('undo', () => {
    const finishedAt = new Date('2026-11-14T04:30:00Z');
    const actor = { kind: 'user', userId: USER_ID } as const;
    const ids = (count: number) =>
      Array.from({ length: count }, (_, index) => `contact-${String(index).padStart(5, '0')}`);

    function finishedImport(status: Import['status'] = 'done', at: Date | null = finishedAt) {
      importing({});
      found = { ...found!, status, finishedAt: at };
    }

    it.each(['done', 'failed'] as const)(
      'marks a %s import undone and queues the removal without deleting yet',
      async (status) => {
        finishedImport(status);
        pool = ids(3);

        const result = await service.undo(STORE_ID, IMPORT_ID, actor);

        expect(result.status).toBe('undone');
        expect(published).toEqual(['import.undo_requested']);
        expect(removed).toEqual([]);
      },
    );

    it('removes the contacts in batches until none are left and then finishes the undo', async () => {
      finishedImport('undone');
      pool = ids(1_200);

      await service.removeContactsOfUndoneImport(STORE_ID, IMPORT_ID);

      expect(removed).toEqual(ids(1_200));
      expect(found?.undoFinishedAt).toEqual(new Date('2026-11-17T04:30:00Z'));
    });

    it('keeps a contact whose consent answer is not the import grant', async () => {
      finishedImport('undone');
      pool = ids(4);
      const [granted, optedOut, manual, whatsappOptOut] = pool;
      answers = [
        { contactId: granted!, channel: 'sms', status: 'granted', source: 'import' },
        { contactId: optedOut!, channel: 'sms', status: 'withdrawn', source: 'opt_out_link' },
        { contactId: manual!, channel: 'sms', status: 'granted', source: 'manual' },
        { contactId: whatsappOptOut!, channel: 'whatsapp', status: 'withdrawn', source: 'stop' },
      ];

      await service.removeContactsOfUndoneImport(STORE_ID, IMPORT_ID);

      expect(removed).toEqual([granted]);
      expect(pool).toEqual([optedOut, manual, whatsappOptOut]);
      expect(found?.undoFinishedAt).not.toBeNull();
    });

    it('removes nothing for an import that is not undone or whose removal finished', async () => {
      pool = ids(5);
      finishedImport('done');
      await service.removeContactsOfUndoneImport(STORE_ID, IMPORT_ID);
      finishedImport('undone');
      found = { ...found!, undoFinishedAt: finishedAt };
      await service.removeContactsOfUndoneImport(STORE_ID, IMPORT_ID);

      expect(removed).toEqual([]);
    });

    it.each(['uploaded', 'importing'] as const)('refuses an import that is %s', async (status) => {
      finishedImport(status);

      await expect(service.undo(STORE_ID, IMPORT_ID, actor)).rejects.toMatchObject({
        code: 'IMPORT_NOT_UNDOABLE',
      });
      expect(published).toEqual([]);
    });

    it('keeps one pending removal and refuses once it has finished', async () => {
      finishedImport();
      await service.undo(STORE_ID, IMPORT_ID, actor);
      await service.undo(STORE_ID, IMPORT_ID, actor);
      expect(published).toHaveLength(1);

      found = { ...found!, undoFinishedAt: finishedAt };

      await expect(service.undo(STORE_ID, IMPORT_ID, actor)).rejects.toMatchObject({
        code: 'IMPORT_NOT_UNDOABLE',
      });
      expect(published).toHaveLength(1);
    });

    it('keeps accepted undo work pending after the seven-day acceptance window', async () => {
      finishedImport('undone', new Date('2026-11-01T04:30:00Z'));
      await expect(service.undo(STORE_ID, IMPORT_ID, actor)).resolves.toMatchObject({
        status: 'undone',
        undoFinishedAt: null,
      });
      expect(published).toEqual([]);
    });

    it.each(['done', 'failed'] as const)(
      'allows an undo of a %s import exactly 7 days after it finished and refuses a later one',
      async (status) => {
        finishedImport(status, new Date('2026-11-10T04:30:00Z'));
        await expect(service.undo(STORE_ID, IMPORT_ID, actor)).resolves.toMatchObject({
          status: 'undone',
        });

        finishedImport(status, new Date('2026-11-10T04:29:59Z'));
        await expect(service.undo(STORE_ID, IMPORT_ID, actor)).rejects.toMatchObject({
          code: 'IMPORT_UNDO_EXPIRED',
        });
      },
    );

    it('answers a missing import with IMPORT_NOT_FOUND', async () => {
      found = undefined;

      await expect(service.undo(STORE_ID, IMPORT_ID, actor)).rejects.toMatchObject({
        code: 'IMPORT_NOT_FOUND',
      });
    });
  });
});
