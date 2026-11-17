import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type ContactImportField,
  type CreateImportInput,
  type ImportResponse,
  type ImportUploadResponse,
  MAX_IMPORT_FILE_BYTES,
  type StartImportInput,
} from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ConsentService } from '../consents/consent.service';
import { type ImportedContact, ContactsService } from '../contacts/contacts.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import {
  type CustomerImportRows,
  decodeCustomerImportFile,
  readCustomerImportRows,
} from './customer-import-rows';
import { FILE_STORAGE_DRIVER } from './file-storage-provider';
import { importError } from './imports.errors';
import {
  type Import,
  type ImportCounts,
  ImportsRepository,
  type NewImportFile,
} from './imports.repository';

type Actor = AuditEntry['actor'];
type Run = { storeId: string; found: Import; lease: Date; finished: boolean };
type Outcome = { status: 'done' | 'failed'; counts?: ImportCounts; lines: ReportLine[] };
type ReportLine = {
  rowNumber?: number;
  field?: ContactImportField | 'sms' | 'whatsapp';
  message: string;
};

const LINK_SECONDS = 15 * 60;
// Each import is a file in R2 and a bulk job, so a store starts at most 20 an hour.
const IMPORTS_PER_HOUR = 20;
// The upload and its report are kept for the 7 days an import can be undone.
const FILE_DAYS = 7;
const UNDO_MILLISECONDS = FILE_DAYS * 24 * 60 * 60 * 1000;
const BATCH_ROWS = 500;
const UNDO_BATCH_ROWS = 1_000;
const CSV = 'text/csv';
// Each batch renews the lease; a run that has not renewed it for 5 minutes is gone.
const LEASE_MS = 5 * 60 * 1000;
// An import with no progress for this long lost its job, or still waits behind a long queue.
const STUCK_MS = 15 * 60 * 1000;
const MAX_REQUEUES = 4;
const COUNT_FOR_OUTCOME = {
  added: 'rowsAdded',
  updated: 'rowsUpdated',
  skipped: 'rowsSkipped',
} as const satisfies Record<ImportedContact['outcome'], keyof ImportCounts>;
const FIELD_LABELS = {
  phone: 'Phone',
  name: 'Name',
  whatsappPhone: 'WhatsApp number',
  email: 'Email',
  address: 'Address',
  district: 'District',
  tags: 'Tags',
  notes: 'Notes',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
} as const satisfies Record<NonNullable<ReportLine['field']>, string>;
const CONSENT_LABELS = { sms: 'SMS', whatsapp: 'WhatsApp' } as const;

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  async createCustomerImport(
    storeId: string,
    input: CreateImportInput,
    actor: Actor,
  ): Promise<ImportUploadResponse> {
    if (!(await this.limiter.consume(`customer-import:${storeId}`, IMPORTS_PER_HOUR, 3600)).allowed)
      throw importError('IMPORT_RATE_LIMITED');
    const importId = newId();
    const upload = this.newFile(storeId, input.sizeBytes, 'pending');
    const userId = actor.kind === 'user' ? actor.userId : null;
    await this.repository.createCustomerImport(storeId, importId, upload, userId);
    const content = { contentLength: input.sizeBytes, contentType: CSV };
    return {
      importId,
      uploadUrl: this.storage.createUploadUrl(upload.objectKey, LINK_SECONDS, content),
    };
  }

  async start(
    storeId: string,
    importId: string,
    input: StartImportInput,
    _actor: Actor,
  ): Promise<ImportResponse> {
    await this.transaction.run(storeId, async () => {
      const now = this.clock.now();
      const started = await this.repository.start(storeId, importId, {
        columnMapping: input.mapping,
        duplicateMode: input.duplicateMode,
        consentEvidence: input.consentEvidence,
        hasConsentConfirmation: Object.keys(input.consentEvidence).length > 0,
        startedAt: now,
      });
      if (!started) {
        await this.findImport(storeId, importId);
        throw importError('IMPORT_ALREADY_STARTED');
      }
      await this.outbox.publish({
        type: 'import.started',
        storeId,
        occurredAt: now.toISOString(),
        payload: { importId },
      });
    });
    return this.get(storeId, importId);
  }

  // The status moves and the event is queued in one transaction, so a crash before the job
  // finishes is covered by the job's rerun: it deletes whatever is still left.
  async undo(storeId: string, importId: string, _actor: Actor): Promise<ImportResponse> {
    await this.transaction.run(storeId, async () => {
      const found = await this.findImport(storeId, importId);
      if (found.status !== 'done') throw importError('IMPORT_NOT_UNDOABLE');
      const now = this.clock.now();
      if (now.getTime() > found.finishedAt!.getTime() + UNDO_MILLISECONDS)
        throw importError('IMPORT_UNDO_EXPIRED');
      if (!(await this.repository.markUndone(storeId, importId)))
        throw importError('IMPORT_NOT_UNDOABLE');
      await this.outbox.publish({
        type: 'import.undo_requested',
        storeId,
        occurredAt: now.toISOString(),
        payload: { importId },
      });
    });
    return this.get(storeId, importId);
  }

  // Each batch is its own statement; a retry deletes only what is still there.
  async removeContactsOfUndoneImport(storeId: string, importId: string): Promise<void> {
    const found = await this.repository.findById(storeId, importId);
    if (found?.status !== 'undone') return;
    for (;;) {
      const removed = await this.contacts.removeUneditedByImport(
        storeId,
        importId,
        UNDO_BATCH_ROWS,
        {
          kind: 'system',
        },
      );
      if (removed < UNDO_BATCH_ROWS) return;
    }
  }

  async get(storeId: string, importId: string): Promise<ImportResponse> {
    const found = await this.findImport(storeId, importId);
    return {
      id: found.id,
      status: found.status,
      rowsTotal: found.rowsTotal,
      rowsAdded: found.rowsAdded,
      rowsUpdated: found.rowsUpdated,
      rowsSkipped: found.rowsSkipped,
      rowsFailed: found.rowsFailed,
      reportUrl: found.reportKey && this.storage.createDownloadUrl(found.reportKey, LINK_SECONDS),
    };
  }

  // The file is read before any transaction opens, and each batch commits on its own. A retry
  // reads the file again: contacts this import added are found, not added twice.
  async runCustomerImport(storeId: string, importId: string): Promise<void> {
    const found = await this.repository.findById(storeId, importId);
    if (found?.status !== 'importing') return;
    const now = this.clock.now();
    const staleBefore = new Date(now.getTime() - LEASE_MS);
    // A fresh lease may belong to a run that died. Returning would let the queue count this job as
    // done, so it fails and is retried, and the sweep queues the import again if nothing moves.
    if (!(await this.repository.claim(storeId, importId, now, staleBefore)))
      throw importError('IMPORT_BEING_RUN');
    const run: Run = { storeId, found, lease: now, finished: false };
    try {
      await this.importFile(run);
    } finally {
      // A failed run lets go at once, so the queue's retry need not wait for the lease to go stale.
      if (!run.finished) await this.repository.releaseClaim(storeId, importId, run.lease);
    }
  }

  // A stalled import is queued again up to MAX_REQUEUES times, because its job may only be waiting
  // behind others or may have died with its worker. After that it fails, with a report.
  async sweepStuckImports(): Promise<void> {
    const now = this.clock.now();
    const before = new Date(now.getTime() - STUCK_MS);
    for (const storeId of await this.repository.storesWithStuckImports(before))
      for (const stuck of await this.repository.listStuck(storeId, before)) {
        const requeued = await this.transaction.run(storeId, async () => {
          const requeue = { before, now, limit: MAX_REQUEUES };
          if (!(await this.repository.requeue(storeId, stuck.id, requeue))) return false;
          await this.outbox.publish({
            type: 'import.started',
            storeId,
            occurredAt: now.toISOString(),
            payload: { importId: stuck.id },
          });
          return true;
        });
        if (!requeued)
          await this.finish(storeId, stuck.id, stuck.claimedAt, {
            status: 'failed',
            lines: [{ message: 'The import stopped before it finished. Upload the file again' }],
          });
      }
  }

  private async importFile(run: Run): Promise<void> {
    const { storeId, found } = run;
    let file: CustomerImportRows;
    try {
      const text = await this.download(found.uploadKey);
      await this.repository.markUploadReady(storeId, found.uploadFileId);
      file = readCustomerImportRows(text, found.columnMapping!);
    } catch (error) {
      // A file that cannot be read fails the import with the reason in its report; nothing to retry.
      if (!(error instanceof AppError)) throw error;
      return this.finishRun(run, { status: 'failed', lines: [{ message: error.message }] });
    }
    const failedRows = new Set(file.errors.map((error) => error.rowNumber)).size;
    const counts = {
      rowsTotal: file.rows.length + failedRows,
      rowsAdded: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsFailed: failedRows,
    };
    const report: ReportLine[] = [...file.errors];
    for (let first = 0; first < file.rows.length; first += BATCH_ROWS) {
      const batch = file.rows.slice(first, first + BATCH_ROWS);
      run.lease = await this.transaction.run(storeId, async () => {
        report.push(...(await this.applyBatch(run, batch, counts)));
        const renewed = this.clock.now();
        const lease = { held: run.lease, renewed };
        if (!(await this.repository.saveProgress(storeId, found.id, counts, lease)))
          throw new Error('Another run took over this import');
        return renewed;
      });
    }
    await this.finishRun(run, { status: 'done', counts, lines: report });
  }

  private async applyBatch(
    { storeId, found }: Run,
    batch: CustomerImportRows['rows'],
    counts: ImportCounts,
  ): Promise<ReportLine[]> {
    const saved = await this.contacts.saveImportedRows(
      storeId,
      found.id,
      batch.map((row) => row.contact),
      found.duplicateMode,
    );
    const rowNumbers = new Map(batch.map((row) => [row.contact.phone, row.rowNumber]));
    const lines: ReportLine[] = [];
    for (const contact of saved) {
      counts[COUNT_FOR_OUTCOME[contact.outcome]] += 1;
      const rowNumber = rowNumbers.get(contact.phone)!;
      lines.push(...contact.notChanged.map((cell) => ({ rowNumber, ...cell })));
    }
    lines.push(...(await this.grantConsent(storeId, found, rowNumbers, saved)));
    return lines;
  }

  // Skipped contacts keep their consent too: `skip` leaves an existing customer as it is.
  private async grantConsent(
    storeId: string,
    found: Import,
    rowNumbers: Map<string, number>,
    saved: ImportedContact[],
  ): Promise<ReportLine[]> {
    const written = saved.filter((contact) => contact.outcome !== 'skipped');
    const actor: Actor = found.createdByUserId
      ? { kind: 'user', userId: found.createdByUserId }
      : { kind: 'system' };
    const lines: ReportLine[] = [];
    for (const channel of ['sms', 'whatsapp'] as const) {
      const evidence = found.consentEvidence?.[channel];
      if (!evidence) continue;
      const contactIds = written.map((contact) => contact.contactId);
      const { withdrawnContactIds } = await this.consents.grantFromImport(
        storeId,
        { contactIds, channel, evidence },
        actor,
      );
      const withdrawn = new Set(withdrawnContactIds);
      lines.push(
        ...written
          .filter((contact) => withdrawn.has(contact.contactId))
          .map((contact) => ({
            rowNumber: rowNumbers.get(contact.phone)!,
            field: channel,
            message: `This customer said no to ${CONSENT_LABELS[channel]} messages, so the import did not change that`,
          })),
      );
    }
    return lines;
  }

  private async finishRun(run: Run, outcome: Outcome): Promise<void> {
    await this.finish(run.storeId, run.found.id, run.lease, outcome);
    // Set only after the write, so a run that failed to save its report lets go of its lease.
    run.finished = true;
  }

  private async finish(
    storeId: string,
    importId: string,
    lease: Date | null,
    { status, counts, lines }: Outcome,
  ): Promise<void> {
    const report = lines.length > 0 ? await this.uploadReport(storeId, lines) : undefined;
    const result = { status, counts, finishedAt: this.clock.now() };
    await this.repository.finish(storeId, importId, { lease, result, report });
  }

  private async findImport(storeId: string, importId: string): Promise<Import> {
    const found = await this.repository.findById(storeId, importId);
    if (!found) throw importError('IMPORT_NOT_FOUND');
    return found;
  }

  private newFile(
    storeId: string,
    sizeBytes: number,
    status: NewImportFile['status'],
  ): NewImportFile {
    const id = newId();
    const expiresAt = new Date(this.clock.now().getTime() + FILE_DAYS * 24 * 60 * 60 * 1000);
    // One R2 lifecycle rule on `imports/` deletes these after 7 days for every store.
    const objectKey = `imports/${storeId}/${id}.csv`;
    return { id, objectKey, contentType: CSV, sizeBytes, status, expiresAt };
  }

  private async download(objectKey: string): Promise<string> {
    const file = await this.storage.readBytes(objectKey, MAX_IMPORT_FILE_BYTES);
    if (file.kind === 'missing') throw importError('IMPORT_FILE_NOT_UPLOADED');
    if (file.kind === 'too_large') throw importError('IMPORT_FILE_TOO_LARGE');
    return decodeCustomerImportFile(file.bytes);
  }

  private async uploadReport(storeId: string, lines: ReportLine[]): Promise<NewImportFile> {
    const body = reportCsv(lines);
    const report = this.newFile(storeId, Buffer.byteLength(body), 'ready');
    await this.storage.writeText(report.objectKey, body, CSV);
    return report;
  }
}

// Every cell is quoted, so a message with a comma stays in one column.
function reportCsv(lines: ReportLine[]): string {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const sorted = [...lines].sort((a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0));
  const records = sorted.map((line) =>
    [String(line.rowNumber ?? ''), line.field ? FIELD_LABELS[line.field] : '', line.message]
      .map(cell)
      .join(','),
  );
  return `${['Row,Field,Problem', ...records].join('\r\n')}\r\n`;
}
