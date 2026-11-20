import { createHash } from 'node:crypto';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type ImportResponse,
  type ImportUploadResponse,
  MAX_IMPORT_FILE_BYTES,
} from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import type { RateLimiter } from '../platform/cache/rate-limiter';
import type { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { decodeCsvFile } from './csv-records';
import { reportCsv } from './import-report';
import { importError } from './imports.errors';
import type {
  Import,
  ImportCounts,
  ImportReportLine as ReportLine,
  KindImportsRepository,
  NewImportFile,
  StartedImport,
  StuckImport,
} from './imports.repository';

type Actor = AuditEntry['actor'];
export type ImportRun = {
  storeId: string;
  found: Import;
  actor: Actor;
  lease: Date;
  finished: boolean;
};
type Outcome = {
  status: 'done' | 'failed';
  counts?: ImportCounts;
  lines: ReportLine[];
  omittedRows?: number;
  exhausted?: { before: Date; limit: number };
};

// What one import kind brings to the shared run: how to read its file and how to write a batch.
export type ImportKind<Row> = {
  // Names the upload rate limit.
  name: string;
  batchSize: number;
  fieldLabels: Record<string, string>;
  readFile(text: string, found: Pick<Import, 'columnMapping'>): ImportFile<Row>;
  // Writes one batch inside the batch transaction, adds to the counts and returns report notes.
  writeBatch(run: ImportRun, rows: Row[], counts: ImportCounts): Promise<ReportLine[]>;
};
export type ImportFile<Row> = {
  rows: Row[];
  errors: ReportLine[];
  rowsTotal: number;
  rowsFailed: number;
};
export type ImportRunnerServices = {
  repository: KindImportsRepository;
  transaction: StoreTransaction;
  outbox: OutboxService;
  clock: Clock;
  storage: FileStorageDriver;
  limiter: RateLimiter;
};

const LINK_SECONDS = 15 * 60;
// Uploads consume R2 storage, so a shop can upload at most 20 files of a kind an hour.
const IMPORTS_PER_HOUR = 20;
// The upload and its report are kept for the 7 days an import can be undone.
const FILE_DAYS = 7;
const MAX_REPORT_NOTES = 5000;
const CSV = 'text/csv';
// Each batch renews the lease; a run that has not renewed it for 5 minutes is gone.
const LEASE_MS = 5 * 60 * 1000;
// An import with no progress for this long lost its job, or still waits behind a long queue.
const STUCK_MS = 15 * 60 * 1000;
const MAX_REQUEUES = 4;

export class ImportRunner<Row> {
  constructor(
    private readonly services: ImportRunnerServices,
    private readonly kind: ImportKind<Row>,
  ) {}

  async create(storeId: string, sizeBytes: number, actor: Actor): Promise<ImportUploadResponse> {
    const { repository, limiter, storage } = this.services;
    if (!(await limiter.consume(`${this.kind.name}:${storeId}`, IMPORTS_PER_HOUR, 3600)).allowed)
      throw importError('IMPORT_RATE_LIMITED');
    const importId = newId();
    const upload = this.newFile(storeId, sizeBytes, 'pending');
    await repository.create(storeId, importId, upload, actor.kind === 'user' ? actor.userId : null);
    return {
      importId,
      uploadUrl: storage.createUploadUrl(upload.objectKey, LINK_SECONDS, {
        sizeBytes,
        contentType: CSV,
      }),
    };
  }

  async start(
    storeId: string,
    importId: string,
    change: StartedImport & { startedAt: Date },
  ): Promise<void> {
    const { repository, transaction, outbox } = this.services;
    await transaction.run(storeId, async () => {
      if (!(await repository.start(storeId, importId, change))) {
        await this.findImport(storeId, importId);
        throw importError('IMPORT_ALREADY_STARTED');
      }
      await outbox.publish({
        type: 'import.started',
        storeId,
        occurredAt: change.startedAt.toISOString(),
        payload: { importId },
      });
    });
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
      reportUrl:
        found.reportKey && this.services.storage.createDownloadUrl(found.reportKey, LINK_SECONDS),
    };
  }

  // The file is read before any transaction opens, and each batch commits on its own. A retry
  // verifies the file again and resumes after the last committed batch.
  async run(storeId: string, importId: string): Promise<void> {
    const { repository, clock } = this.services;
    const found = await repository.findById(storeId, importId);
    if (found?.status !== 'importing') return;
    const now = clock.now();
    const staleBefore = new Date(now.getTime() - LEASE_MS);
    // A fresh lease may belong to a run that died. Returning would let the queue count this job as
    // done, so it fails and is retried, and the sweep queues the import again if nothing moves.
    if (!(await repository.claim(storeId, importId, now, staleBefore)))
      throw importError('IMPORT_BEING_RUN');
    const run: ImportRun = {
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
      if (!run.finished) await repository.releaseClaim(storeId, importId, run.lease);
    }
  }

  // The time before which an import with no progress counts as stuck.
  stuckBefore(): Date {
    return new Date(this.services.clock.now().getTime() - STUCK_MS);
  }

  // A stalled import is queued again up to MAX_REQUEUES times, because its job may only be waiting
  // behind others or may have died with its worker. After that it fails, with a report.
  async sweepStuck(storeIds: string[], before: Date): Promise<void> {
    const { repository, transaction, outbox, clock } = this.services;
    const now = clock.now();
    for (const storeId of storeIds) {
      for (const stuck of await repository.listStuck(storeId, before)) {
        const requeued = await transaction.run(storeId, async () => {
          const requeue = { before, now, limit: MAX_REQUEUES };
          if (!(await repository.requeue(storeId, stuck.id, requeue))) return false;
          await outbox.publish({
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
    await this.services.repository.markUploadReady(storeId, found.uploadFileId);
    return { fileHash, file: this.kind.readFile(text, found) };
  }

  private async importFile(run: ImportRun): Promise<void> {
    const { storeId, found } = run;
    const { repository, transaction, clock } = this.services;
    const saved = found.checkpoint ?? { processedRows: 0, report: [], omittedRows: 0 };
    let read: { file: ImportFile<Row>; fileHash: string };
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
    const counts: ImportCounts = {
      rowsTotal: found.rowsTotal ?? file.rowsTotal,
      rowsAdded: found.rowsAdded ?? 0,
      rowsUpdated: found.rowsUpdated ?? 0,
      rowsSkipped: found.rowsSkipped ?? 0,
      rowsFailed: found.rowsFailed ?? file.rowsFailed,
    };
    const report: ReportLine[] = saved.report;
    let omittedRows = saved.omittedRows;
    for (let first = saved.processedRows; first < file.rows.length; first += this.kind.batchSize) {
      const batch = file.rows.slice(first, first + this.kind.batchSize);
      run.lease = await transaction.run(storeId, async () => {
        const notes = await this.kind.writeBatch(run, batch, counts);
        const kept = notes.slice(0, MAX_REPORT_NOTES - report.length);
        report.push(...kept);
        // One row can have several notes; count it once when notes are left out.
        omittedRows += new Set(notes.slice(kept.length).map((line) => line.rowNumber)).size;
        const renewed = clock.now();
        const checkpoint = { processedRows: first + batch.length, fileHash, report, omittedRows };
        const lease = { held: run.lease, renewed, checkpoint };
        if (!(await repository.saveProgress(storeId, found.id, counts, lease)))
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

  private async finishRun(run: ImportRun, outcome: Outcome): Promise<void> {
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
    const { repository, clock, storage } = this.services;
    const report =
      lines.length > 0 || omittedRows > 0
        ? await this.uploadReport(storeId, lines, omittedRows)
        : undefined;
    const result = { status, counts, finishedAt: clock.now() };
    const finished = await repository.finish(storeId, importId, {
      lease,
      result,
      report,
      exhausted,
    });
    if (!finished && report) await storage.deleteObject(report.objectKey);
  }

  async findImport(storeId: string, importId: string): Promise<Import> {
    const found = await this.services.repository.findById(storeId, importId);
    if (!found) throw importError('IMPORT_NOT_FOUND');
    return found;
  }

  private newFile(
    storeId: string,
    sizeBytes: number,
    status: NewImportFile['status'],
  ): NewImportFile {
    const id = newId();
    const expiresAt = new Date(
      this.services.clock.now().getTime() + FILE_DAYS * 24 * 60 * 60 * 1000,
    );
    // One R2 lifecycle rule on `imports/` deletes these after 7 days for every store.
    const objectKey = `imports/${storeId}/${id}.csv`;
    return { id, objectKey, contentType: CSV, sizeBytes, status, expiresAt };
  }

  private async download(objectKey: string): Promise<string> {
    const file = await this.services.storage.readBytes(objectKey, MAX_IMPORT_FILE_BYTES);
    if (file.kind === 'missing') throw importError('IMPORT_FILE_NOT_UPLOADED');
    if (file.kind === 'too_large') throw importError('IMPORT_FILE_TOO_LARGE');
    return decodeCsvFile(file.bytes);
  }

  private async uploadReport(
    storeId: string,
    lines: ReportLine[],
    omittedRows: number,
  ): Promise<NewImportFile> {
    const body = reportCsv(lines, omittedRows, this.kind.fieldLabels);
    const report = this.newFile(storeId, Buffer.byteLength(body), 'ready');
    await this.services.storage.writeText(report.objectKey, body, CSV);
    return report;
  }
}
