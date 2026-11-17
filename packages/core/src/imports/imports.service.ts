import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CreateImportInput,
  ImportResponse,
  ImportUploadResponse,
  StartImportInput,
} from '@dakly/contracts/contacts';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { FILE_STORAGE_DRIVER } from './file-storage-provider';
import { importError } from './imports.errors';
import { type Import, ImportsRepository, type NewImportFile } from './imports.repository';

type Actor = AuditEntry['actor'];

const LINK_SECONDS = 15 * 60;
// The upload and its report are kept for the 7 days an import can be undone.
const FILE_DAYS = 7;

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
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
}
