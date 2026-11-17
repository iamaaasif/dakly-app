import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
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
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import { importError } from './imports.errors';
import { type Import, ImportsRepository, type NewImportFile } from './imports.repository';

type Actor = AuditEntry['actor'];

const LINK_SECONDS = 15 * 60;
// Each import is a file in R2 and a bulk job, so a store starts at most 20 an hour.
const IMPORTS_PER_HOUR = 20;
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
    const upload = this.newFile(storeId, input.sizeBytes);
    const userId = actor.kind === 'user' ? actor.userId : null;
    await this.repository.createCustomerImport(storeId, importId, upload, userId);
    const content = { sizeBytes: input.sizeBytes, contentType: 'text/csv' };
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
    // One R2 lifecycle rule on `imports/` deletes these after 7 days for every store.
    return { id, objectKey: `imports/${storeId}/${id}.csv`, sizeBytes, expiresAt };
  }
}
