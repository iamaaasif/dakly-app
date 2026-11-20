import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CreateImportInput,
  ImportResponse,
  ImportUploadResponse,
  StartImportInput,
} from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ConsentService } from '../consents/consent.service';
import { type ImportedContact, ContactsService } from '../contacts/contacts.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import {
  type CustomerImportRows,
  FIELD_LABELS,
  readCustomerImportRows,
} from './customer-import-rows';
import { type ImportRun, ImportRunner } from './import-runner';
import {
  type ImportCounts,
  type ImportReportLine as ReportLine,
  ImportsRepository,
} from './imports.repository';
import { UndoCustomerImport } from './undo-customer-import';

type Actor = AuditEntry['actor'];
type CustomerRow = CustomerImportRows['rows'][number];

const BATCH_ROWS = ConsentService.AUDIENCE_LIMIT;
const COUNT_FOR_OUTCOME = {
  added: 'rowsAdded',
  updated: 'rowsUpdated',
  skipped: 'rowsSkipped',
} as const satisfies Record<ImportedContact['outcome'], keyof ImportCounts>;

@Injectable()
export class ImportsService {
  private readonly runner: ImportRunner<CustomerRow>;

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
  ) {
    this.runner = new ImportRunner(
      { repository, transaction, outbox, clock, storage, limiter },
      {
        name: 'customer-import',
        batchSize: BATCH_ROWS,
        fieldLabels: FIELD_LABELS,
        readFile: (text, found) => {
          const file = readCustomerImportRows(text, found.columnMapping!);
          const rowsFailed = new Set(file.errors.map((error) => error.rowNumber)).size;
          return { ...file, rowsFailed, rowsTotal: file.rows.length + rowsFailed };
        },
        writeBatch: (run, rows, counts) => this.applyBatch(run, rows, counts),
      },
    );
  }

  createCustomerImport(
    storeId: string,
    input: CreateImportInput,
    actor: Actor,
  ): Promise<ImportUploadResponse> {
    return this.runner.create(storeId, input.sizeBytes, actor);
  }

  async start(
    storeId: string,
    importId: string,
    input: StartImportInput,
    actor: Actor,
  ): Promise<ImportResponse> {
    await this.runner.start(storeId, importId, {
      columnMapping: input.mapping,
      duplicateMode: input.duplicateMode,
      consentEvidence: input.consentEvidence,
      hasConsentConfirmation: Object.keys(input.consentEvidence).length > 0,
      startedAt: this.clock.now(),
      startedByUserId: actor.kind === 'user' ? actor.userId : null,
    });
    return this.get(storeId, importId);
  }

  async undo(storeId: string, importId: string, _actor: Actor): Promise<ImportResponse> {
    await this.undoImport.request(storeId, importId);
    return this.get(storeId, importId);
  }

  finishUndo(storeId: string, importId: string, actor: Actor): Promise<void> {
    return this.undoImport.run(storeId, importId, actor);
  }

  get(storeId: string, importId: string): Promise<ImportResponse> {
    return this.runner.get(storeId, importId);
  }

  runCustomerImport(storeId: string, importId: string): Promise<void> {
    return this.runner.run(storeId, importId);
  }

  async sweepStuckImports(): Promise<void> {
    const before = this.runner.stuckBefore();
    for (const storeId of await this.repository.storesWithStuckImports(before)) {
      await this.undoImport.recover(storeId, before);
      await this.runner.sweepStuck([storeId], before);
    }
  }

  private async applyBatch(
    run: ImportRun,
    batch: CustomerRow[],
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
    run: ImportRun,
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
}
