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
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { type CustomerImportRows, readCustomerImportRows } from './customer-import-rows';
import { FILE_STORAGE_DRIVER } from './file-storage-provider';
import { importError } from './imports.errors';
import {
  type Import,
  type ImportCounts,
  ImportsRepository,
  type NewImportFile,
} from './imports.repository';

type Actor = AuditEntry['actor'];
type ReportLine = {
  rowNumber?: number;
  field?: ContactImportField | 'sms' | 'whatsapp';
  message: string;
};

const LINK_SECONDS = 15 * 60;
// The upload and its report are kept for the 7 days an import can be undone.
const FILE_DAYS = 7;
const UNDO_MILLISECONDS = FILE_DAYS * 24 * 60 * 60 * 1000;
const BATCH_ROWS = 500;
const COUNT_FOR_OUTCOME = {
  added: 'rowsAdded',
  updated: 'rowsUpdated',
  skipped: 'rowsSkipped',
} as const satisfies Record<ImportedContact['outcome'], keyof ImportCounts>;
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
  ) {}

  async createCustomerImport(
    storeId: string,
    input: CreateImportInput,
    actor: Actor,
  ): Promise<ImportUploadResponse> {
    const importId = newId();
    const upload = this.newFile(storeId, input.sizeBytes);
    const userId = actor.kind === 'user' ? actor.userId : null;
    await this.repository.createCustomerImport(storeId, importId, upload, userId);
    return { importId, uploadUrl: this.storage.createUploadUrl(upload.objectKey, LINK_SECONDS) };
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

  // Up to 50,000 contacts go in one indexed statement inside one short transaction, with no
  // vendor call, so this needs no job. Contacts the import only updated have no import_id.
  async undo(storeId: string, importId: string, actor: Actor): Promise<ImportResponse> {
    await this.transaction.run(storeId, async () => {
      const found = await this.findImport(storeId, importId);
      if (found.status !== 'done') throw importError('IMPORT_NOT_UNDOABLE');
      if (this.clock.now().getTime() > found.finishedAt!.getTime() + UNDO_MILLISECONDS)
        throw importError('IMPORT_UNDO_EXPIRED');
      if (!(await this.repository.markUndone(storeId, importId)))
        throw importError('IMPORT_NOT_UNDOABLE');
      await this.contacts.removeCreatedByImport(storeId, importId, found.finishedAt!, actor);
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

  // The file is read before any transaction opens, and each batch commits on its own. A retry
  // reads the file again: contacts this import added are found, not added twice.
  async runCustomerImport(storeId: string, importId: string): Promise<void> {
    const found = await this.repository.findById(storeId, importId);
    if (found?.status !== 'importing') return;
    let file: CustomerImportRows;
    try {
      file = readCustomerImportRows(await this.download(found.uploadKey), found.columnMapping!);
    } catch (error) {
      // A file that cannot be read fails the import with the reason in its report; nothing to retry.
      if (!(error instanceof AppError)) throw error;
      return this.finish(storeId, importId, {
        status: 'failed',
        lines: [{ message: error.message }],
      });
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
      await this.transaction.run(storeId, async () => {
        const saved = await this.contacts.saveImportedRows(
          storeId,
          importId,
          batch.map((row) => row.contact),
          found.duplicateMode,
        );
        for (const contact of saved) counts[COUNT_FOR_OUTCOME[contact.outcome]] += 1;
        report.push(...(await this.grantConsent(storeId, found, batch, saved)));
        await this.repository.saveProgress(storeId, importId, counts);
      });
    }
    await this.finish(storeId, importId, { status: 'done', counts, lines: report });
  }

  // Skipped contacts keep their consent too: `skip` leaves an existing customer as it is.
  private async grantConsent(
    storeId: string,
    found: Import,
    batch: CustomerImportRows['rows'],
    saved: ImportedContact[],
  ): Promise<ReportLine[]> {
    const rowNumbers = new Map(batch.map((row) => [row.contact.phone, row.rowNumber]));
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

  private async finish(
    storeId: string,
    importId: string,
    {
      status,
      counts,
      lines,
    }: { status: 'done' | 'failed'; counts?: ImportCounts; lines: ReportLine[] },
  ): Promise<void> {
    const report = lines.length > 0 ? await this.uploadReport(storeId, lines) : undefined;
    const finishedAt = this.clock.now();
    await this.repository.finish(storeId, importId, { status, counts, finishedAt }, report);
  }

  private async findImport(storeId: string, importId: string): Promise<Import> {
    const found = await this.repository.findById(storeId, importId);
    if (!found) throw importError('IMPORT_NOT_FOUND');
    return found;
  }

  private newFile(storeId: string, sizeBytes: number): NewImportFile {
    const id = newId();
    const expiresAt = new Date(this.clock.now().getTime() + FILE_DAYS * 24 * 60 * 60 * 1000);
    return { id, objectKey: `stores/${storeId}/imports/${id}.csv`, sizeBytes, expiresAt };
  }

  private async download(objectKey: string): Promise<string> {
    const file = await this.storage.readText(objectKey, MAX_IMPORT_FILE_BYTES);
    if (file.kind === 'missing') throw importError('IMPORT_FILE_NOT_UPLOADED');
    if (file.kind === 'too_large') throw importError('IMPORT_FILE_TOO_LARGE');
    return file.text;
  }

  private async uploadReport(storeId: string, lines: ReportLine[]): Promise<NewImportFile> {
    const body = reportCsv(lines);
    const report = this.newFile(storeId, Buffer.byteLength(body));
    await this.storage.writeText(report.objectKey, body, 'text/csv');
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
