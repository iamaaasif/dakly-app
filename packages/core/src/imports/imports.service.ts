import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
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
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import { FIELD_LABELS, reportCsv } from './customer-import-report';
import {
  type CustomerImportRows,
  decodeCustomerImportFile,
  readCustomerImportRows,
} from './customer-import-rows';
import { importError } from './imports.errors';
import {
  type Import,
  type ImportCounts,
  type ImportReportLine as ReportLine,
  ImportsRepository,
  type NewImportFile,
  type StuckImport,
} from './imports.repository';
import { UndoCustomerImport } from './undo-customer-import';

type Actor = AuditEntry['actor'];
type Run = { storeId: string; found: Import; actor: Actor; lease: Date; finished: boolean };
type Outcome = {
  status: 'done' | 'failed';
  counts?: ImportCounts;
  lines: ReportLine[];
  omittedRows?: number;
  exhausted?: { before: Date; limit: number };
};

const LINK_SECONDS = 15 * 60;
// Uploads consume R2 storage, so a shop can upload at most 20 customer files an hour.
const IMPORTS_PER_HOUR = 20;
// The upload and its report are kept for the 7 days an import can be undone.
const FILE_DAYS = 7;
const BATCH_ROWS = ConsentService.AUDIENCE_LIMIT;
const MAX_REPORT_NOTES = 5000;
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
    @Inject(UndoCustomerImport) private readonly undoImport: UndoCustomerImport,
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
    const content = { sizeBytes: input.sizeBytes, contentType: CSV };
    return {
      importId,
      uploadUrl: this.storage.createUploadUrl(upload.objectKey, LINK_SECONDS, content),
    };
  }

  async start(
    storeId: string,
    importId: string,
    input: StartImportInput,
    actor: Actor,
  ): Promise<ImportResponse> {
    await this.transaction.run(storeId, async () => {
      const now = this.clock.now();
      const started = await this.repository.start(storeId, importId, {
        columnMapping: input.mapping,
        duplicateMode: input.duplicateMode,
        consentEvidence: input.consentEvidence,
        hasConsentConfirmation: Object.keys(input.consentEvidence).length > 0,
        startedAt: now,
        startedByUserId: actor.kind === 'user' ? actor.userId : null,
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

  async undo(storeId: string, importId: string, actor: Actor): Promise<ImportResponse> {
    await this.undoImport.request(storeId, importId, actor);
    return this.get(storeId, importId);
  }

  removeContactsOfUndoneImport(storeId: string, importId: string): Promise<void> {
    return this.undoImport.run(storeId, importId, { kind: 'system' });
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
      undoFinishedAt: found.undoFinishedAt?.toISOString() ?? null,
      reportUrl: found.reportKey && this.storage.createDownloadUrl(found.reportKey, LINK_SECONDS),
    };
  }

  // The file is read before any transaction opens, and each batch commits on its own. A retry
  // verifies the file again and resumes after the last committed batch.
  async runCustomerImport(storeId: string, importId: string): Promise<void> {
    const found = await this.repository.findById(storeId, importId);
    if (found?.status !== 'importing') return;
    const now = this.clock.now();
    const staleBefore = new Date(now.getTime() - LEASE_MS);
    // A fresh lease may belong to a run that died. Returning would let the queue count this job as
    // done, so it fails and is retried, and the sweep queues the import again if nothing moves.
    if (!(await this.repository.claim(storeId, importId, now, staleBefore)))
      throw importError('IMPORT_BEING_RUN');
    const run: Run = {
      storeId,
      found,
      actor: found.startedByUserId
        ? { kind: 'user', userId: found.startedByUserId }
        : { kind: 'system' },
      lease: now,
      finished: false,
    };
    try {
      // The prior run may have committed a batch between the eligibility read and this claim.
      run.found = await this.findImport(storeId, importId);
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
    for (const storeId of await this.repository.storesWithStuckImports(before)) {
      await this.undoImport.recover(storeId, before, { kind: 'system' });
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
            lines: await this.stoppedImportReport(storeId, stuck),
            omittedRows: stuck.checkpoint?.omittedRows ?? 0,
            exhausted: { before, limit: MAX_REQUEUES },
          });
      }
    }
  }

  private async stoppedImportReport(storeId: string, stuck: StuckImport): Promise<ReportLine[]> {
    let errors: ReportLine[];
    try {
      errors = (await this.readImportFile(storeId, stuck)).file.errors;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      errors = [{ message: error.message }];
    }
    return [
      ...errors,
      ...(stuck.checkpoint?.report ?? []),
      { message: 'The import stopped before it finished. Upload the file again' },
    ];
  }

  private async readImportFile(
    storeId: string,
    found: Pick<Import, 'uploadKey' | 'uploadFileId' | 'checkpoint' | 'columnMapping'>,
  ) {
    const text = await this.download(found.uploadKey);
    const fileHash = createHash('sha256').update(text).digest('hex');
    if (found.checkpoint && found.checkpoint.fileHash !== fileHash)
      throw importError('IMPORT_FILE_CHANGED');
    await this.repository.markUploadReady(storeId, found.uploadFileId);
    return { fileHash, file: readCustomerImportRows(text, found.columnMapping!) };
  }

  private async importFile(run: Run): Promise<void> {
    const { storeId, found } = run;
    const saved = found.checkpoint ?? { processedRows: 0, report: [], omittedRows: 0 };
    let read: { file: CustomerImportRows; fileHash: string };
    try {
      read = await this.readImportFile(storeId, found);
    } catch (error) {
      // A file that cannot be read fails the import with the reason in its report; nothing to retry.
      if (!(error instanceof AppError)) throw error;
      return this.finishRun(run, {
        status: 'failed',
        lines: [...saved.report, { message: error.message }],
        omittedRows: saved.omittedRows,
      });
    }
    const { file, fileHash } = read;
    const counts = resumedCounts(found, file);
    const report: ReportLine[] = saved.report;
    let omittedRows = saved.omittedRows;
    for (let first = saved.processedRows; first < file.rows.length; first += BATCH_ROWS) {
      const batch = file.rows.slice(first, first + BATCH_ROWS);
      run.lease = await this.transaction.run(storeId, async () => {
        const notes = await this.applyBatch(run, batch, counts);
        const kept = notes.slice(0, MAX_REPORT_NOTES - report.length);
        report.push(...kept);
        // One row can have several notes; count it once when notes are left out.
        omittedRows += new Set(notes.slice(kept.length).map((line) => line.rowNumber)).size;
        const renewed = this.clock.now();
        const checkpoint = { processedRows: first + batch.length, fileHash, report, omittedRows };
        const lease = { held: run.lease, renewed, checkpoint };
        if (!(await this.repository.saveProgress(storeId, found.id, counts, lease)))
          throw new Error('Another run took over this import');
        return renewed;
      });
    }
    await this.finishRun(run, {
      status: 'done',
      counts,
      lines: [...file.errors, ...report],
      omittedRows,
    });
  }

  private async applyBatch(
    run: Run,
    batch: CustomerImportRows['rows'],
    counts: ImportCounts,
  ): Promise<ReportLine[]> {
    const { storeId, found, actor } = run;
    const rows = batch.map((row) => row.contact);
    const matches = await this.contacts.findImportMatches(
      storeId,
      rows.map((row) => row.phone),
    );
    const ids = matches.map((contact) => contact.id);
    await this.contacts.lockForConsent(storeId, ids);
    const answers = await this.consents.currentForAudience(storeId, ids, 'whatsapp');
    const saved = await this.contacts.saveImportedRows(
      storeId,
      found.id,
      {
        rows,
        duplicateMode: found.duplicateMode,
        whatsappAnswered: new Set(
          answers
            .filter((answer) => answer.status !== 'not_answered')
            .map((answer) => answer.contactId),
        ),
        matchedContactIds: new Set(ids),
      },
      actor,
    );
    const rowNumbers = new Map(batch.map((row) => [row.contact.phone, row.rowNumber]));
    const lines: ReportLine[] = [];
    for (const contact of saved) {
      counts[COUNT_FOR_OUTCOME[contact.outcome]] += 1;
      const rowNumber = rowNumbers.get(contact.phone)!;
      lines.push(...contact.notChanged.map((cell) => ({ rowNumber, ...cell })));
    }
    lines.push(...(await this.grantConsent(run, rowNumbers, saved)));
    return lines;
  }

  // Skipped contacts keep their consent too: `skip` leaves an existing customer as it is.
  private async grantConsent(
    run: Run,
    rowNumbers: Map<string, number>,
    saved: ImportedContact[],
  ): Promise<ReportLine[]> {
    const { storeId, found, actor } = run;
    const written = saved.filter((contact) => contact.outcome !== 'skipped');
    const lines: ReportLine[] = [];
    for (const channel of ['sms', 'whatsapp'] as const) {
      const evidence = found.consentEvidence?.[channel];
      if (!evidence) continue;
      const mismatched =
        channel === 'whatsapp'
          ? written.filter((contact) => contact.hasWhatsappNumberMismatch)
          : [];
      lines.push(
        ...mismatched.map((contact) => ({
          rowNumber: rowNumbers.get(contact.phone)!,
          field: channel,
          message: 'WhatsApp consent skipped: number differs',
        })),
      );
      const contactIds = written
        .filter((contact) => channel !== 'whatsapp' || !contact.hasWhatsappNumberMismatch)
        .map((contact) => contact.contactId);
      const { withdrawnContactIds } = await this.consents.grantFromImport(
        storeId,
        { contactIds, channel, evidence, importId: found.id },
        actor,
      );
      const withdrawn = new Set(withdrawnContactIds);
      lines.push(
        ...written
          .filter((contact) => withdrawn.has(contact.contactId))
          .map((contact) => ({
            rowNumber: rowNumbers.get(contact.phone)!,
            field: channel,
            message: `This customer said no to ${FIELD_LABELS[channel]} messages, so the import did not change that`,
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

  private async stoppedImportReport(storeId: string, stuck: StuckImport): Promise<ReportLine[]> {
    let errors: ReportLine[];
    try {
      errors = (await this.readImportFile(storeId, stuck)).file.errors;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      errors = [{ message: error.message }];
    }
    return [
      ...errors,
      ...(stuck.checkpoint?.report ?? []),
      { message: 'The import stopped before it finished. Upload the file again' },
    ];
  }

  private async readImportFile(
    storeId: string,
    found: Pick<Import, 'uploadKey' | 'uploadFileId' | 'checkpoint' | 'columnMapping'>,
  ) {
    const text = await this.download(found.uploadKey);
    const fileHash = createHash('sha256').update(text).digest('hex');
    if (found.checkpoint && found.checkpoint.fileHash !== fileHash)
      throw importError('IMPORT_FILE_CHANGED');
    await this.repository.markUploadReady(storeId, found.uploadFileId);
    return { fileHash, file: readCustomerImportRows(text, found.columnMapping!) };
  }

  private async importFile(run: Run): Promise<void> {
    const { storeId, found } = run;
    const saved = found.checkpoint ?? { processedRows: 0, report: [], omittedRows: 0 };
    let read: { file: CustomerImportRows; fileHash: string };
    try {
      read = await this.readImportFile(storeId, found);
    } catch (error) {
      // A file that cannot be read fails the import with the reason in its report; nothing to retry.
      if (!(error instanceof AppError)) throw error;
      return this.finishRun(run, {
        status: 'failed',
        lines: [...saved.report, { message: error.message }],
        omittedRows: saved.omittedRows,
      });
    }
    const { file, fileHash } = read;
    const counts = resumedCounts(found, file);
    const report: ReportLine[] = saved.report;
    let omittedRows = saved.omittedRows;
    for (let first = saved.processedRows; first < file.rows.length; first += BATCH_ROWS) {
      const batch = file.rows.slice(first, first + BATCH_ROWS);
      run.lease = await this.transaction.run(storeId, async () => {
        const notes = await this.applyBatch(run, batch, counts);
        const kept = notes.slice(0, MAX_REPORT_NOTES - report.length);
        report.push(...kept);
        // One row can have several notes; count it once when notes are left out.
        omittedRows += new Set(notes.slice(kept.length).map((line) => line.rowNumber)).size;
        const renewed = this.clock.now();
        const checkpoint = { processedRows: first + batch.length, fileHash, report, omittedRows };
        const lease = { held: run.lease, renewed, checkpoint };
        if (!(await this.repository.saveProgress(storeId, found.id, counts, lease)))
          throw new Error('Another run took over this import');
        return renewed;
      });
    }
    await this.finishRun(run, {
      status: 'done',
      counts,
      lines: [...file.errors, ...report],
      omittedRows,
    });
  }

  private async applyBatch(
    run: Run,
    batch: CustomerImportRows['rows'],
    counts: ImportCounts,
  ): Promise<ReportLine[]> {
    const { storeId, found, actor } = run;
    const rows = batch.map((row) => row.contact);
    const matches = await this.contacts.findImportMatches(
      storeId,
      rows.map((row) => row.phone),
    );
    const ids = matches.map((contact) => contact.id);
    await this.contacts.lockForConsent(storeId, ids);
    const answers = await this.consents.currentForAudience(storeId, ids, 'whatsapp');
    const saved = await this.contacts.saveImportedRows(
      storeId,
      found.id,
      {
        rows,
        duplicateMode: found.duplicateMode,
        whatsappAnswered: new Set(answers.map((answer) => answer.contactId)),
        matchedContactIds: new Set(ids),
      },
      actor,
    );
    const rowNumbers = new Map(batch.map((row) => [row.contact.phone, row.rowNumber]));
    const lines: ReportLine[] = [];
    for (const contact of saved) {
      counts[COUNT_FOR_OUTCOME[contact.outcome]] += 1;
      const rowNumber = rowNumbers.get(contact.phone)!;
      lines.push(...contact.notChanged.map((cell) => ({ rowNumber, ...cell })));
    }
    lines.push(...(await this.grantConsent(run, rowNumbers, saved)));
    return lines;
  }

  // Skipped contacts keep their consent too: `skip` leaves an existing customer as it is.
  private async grantConsent(
    run: Run,
    rowNumbers: Map<string, number>,
    saved: ImportedContact[],
  ): Promise<ReportLine[]> {
    const { storeId, found, actor } = run;
    const written = saved.filter((contact) => contact.outcome !== 'skipped');
    const lines: ReportLine[] = [];
    for (const channel of ['sms', 'whatsapp'] as const) {
      const evidence = found.consentEvidence?.[channel];
      if (!evidence) continue;
      const mismatched =
        channel === 'whatsapp'
          ? written.filter((contact) => contact.hasWhatsappNumberMismatch)
          : [];
      lines.push(
        ...mismatched.map((contact) => ({
          rowNumber: rowNumbers.get(contact.phone)!,
          field: channel,
          message: 'WhatsApp consent skipped: number differs',
        })),
      );
      const contactIds = written
        .filter((contact) => channel !== 'whatsapp' || !contact.hasWhatsappNumberMismatch)
        .map((contact) => contact.contactId);
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
            message: `This customer said no to ${FIELD_LABELS[channel]} messages, so the import did not change that`,
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
    { status, counts, lines, omittedRows = 0, exhausted }: Outcome,
  ): Promise<void> {
    const report =
      lines.length > 0 || omittedRows > 0
        ? await this.uploadReport(storeId, lines, omittedRows)
        : undefined;
    const result = { status, counts, finishedAt: this.clock.now() };
    const finished = await this.repository.finish(storeId, importId, {
      lease,
      result,
      report,
      exhausted,
    });
    if (!finished && report) await this.storage.deleteObject(report.objectKey);
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

  private async uploadReport(
    storeId: string,
    lines: ReportLine[],
    omittedRows: number,
  ): Promise<NewImportFile> {
    const body = reportCsv(lines, omittedRows);
    const report = this.newFile(storeId, Buffer.byteLength(body), 'ready');
    await this.storage.writeText(report.objectKey, body, CSV);
    return report;
  }
}

function resumedCounts(found: Import, file: CustomerImportRows): ImportCounts {
  const failedRows = new Set(file.errors.map((error) => error.rowNumber)).size;
  return {
    rowsTotal: found.rowsTotal ?? file.rows.length + failedRows,
    rowsAdded: found.rowsAdded ?? 0,
    rowsUpdated: found.rowsUpdated ?? 0,
    rowsSkipped: found.rowsSkipped ?? 0,
    rowsFailed: found.rowsFailed ?? failedRows,
  };
}
