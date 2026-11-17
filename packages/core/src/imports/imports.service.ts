import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ContactImportField,
  CreateImportInput,
  ImportResponse,
  ImportUploadResponse,
  StartImportInput,
} from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { FILE_STORAGE_DRIVER } from './file-storage-provider';
import { importError } from './imports.errors';
import {
  type Import,
  type ImportCounts,
  ImportsRepository,
  type NewImportFile,
} from './imports.repository';

type Actor = AuditEntry['actor'];
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
const CSV = 'text/csv';
// An import with no progress for this long lost its job, or still waits behind a long queue.
const STUCK_MS = 15 * 60 * 1000;
const MAX_REQUEUES = 4;

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
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
    [String(line.rowNumber ?? ''), line.field ?? '', line.message].map(cell).join(','),
  );
  return `${['Row,Field,Problem', ...records].join('\r\n')}\r\n`;
}
