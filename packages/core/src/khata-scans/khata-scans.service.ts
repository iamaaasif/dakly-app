import { Inject, Injectable } from '@nestjs/common';

import {
  type CreateKhataPageInput,
  type KhataMatchKind,
  type KhataPageResponse,
  type KhataPageUploadResponse,
  KHATA_CONFIDENCE_THRESHOLD,
  khataModelOutputSchema,
} from '@dakly/contracts/khata-scans';
import { KHATA_PAGE_MAX_BYTES } from '@dakly/contracts/khata-scans';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { AiService } from '../ai/ai.service';
import { ContactsService } from '../contacts/contacts.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import { UsageService } from '../usage/usage.service';
import { readKhataRows, type ReadKhataRow } from './khata-row-reading';
import { khataScanError } from './khata-scans.errors';
import {
  type KhataPage,
  KhataScansRepository,
  type NewKhataRow,
  type StoredKhataRow,
} from './khata-scans.repository';
import { readKhataPage } from './prompts/read-khata-page.v2';

const UPLOAD_LINK_SECONDS = 15 * 60;
const PHOTO_LINK_SECONDS = 15 * 60;
// Rule 7: photos are kept 30 days for review, then deleted; the rows stay.
const PHOTO_DAYS = 30;
const PAGES_PER_HOUR = 100;
// A handwritten page is slower to read than a chat message.
// A reader that has not finished in 5 minutes is gone; the next delivery takes the page over.
const LEASE_MS = 5 * 60 * 1000;
const TRANSIENT_MODEL_FAILURES: ReadonlySet<string> = new Set([
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'AI_PAUSED',
  'AI_STORE_BUSY',
]);
const MODEL_INSTRUCTION = 'Read the attached khata page.';

type MatchedRow = NewKhataRow;

@Injectable()
export class KhataScansService {
  constructor(
    @Inject(KhataScansRepository) private readonly repository: KhataScansRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  async createPage(
    storeId: string,
    userId: string,
    input: CreateKhataPageInput,
  ): Promise<KhataPageUploadResponse> {
    if (!(await this.limiter.consume(`khata-page:${storeId}`, PAGES_PER_HOUR, 3600)).allowed)
      throw khataScanError('KHATA_SCAN_RATE_LIMITED');
    const pageId = newId();
    const fileId = newId();
    const objectKey = `khata/${storeId}/${pageId}`;
    await this.repository.insertPage(storeId, {
      id: pageId,
      fileId,
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      photoExpiresAt: new Date(this.clock.now().getTime() + PHOTO_DAYS * 24 * 60 * 60 * 1000),
      createdByUserId: userId,
    });
    return {
      pageId,
      uploadUrl: this.storage.createUploadUrl(objectKey, UPLOAD_LINK_SECONDS, input),
    };
  }

  // The page is charged only when it is read, so an exhausted allowance is refused up front
  // rather than after a model call.
  async requestRead(storeId: string, pageId: string): Promise<KhataPageResponse> {
    const page = await this.findPage(storeId, pageId);
    if (!page.objectKey) throw khataScanError('KHATA_PAGE_NOT_UPLOADED');
    const stored = await this.storage.getObjectMetadata(page.objectKey);
    if (!stored || stored.contentType !== page.contentType || stored.sizeBytes !== page.sizeBytes)
      throw khataScanError('KHATA_PAGE_NOT_UPLOADED');
    if (!(await this.usage.hasAllowance(storeId, 'ai_scan', 1)))
      throw khataScanError('KHATA_SCAN_ALLOWANCE_EXCEEDED');
    await this.transaction.run(storeId, async () => {
      if (!(await this.repository.markQueued(storeId, pageId)))
        throw khataScanError('KHATA_PAGE_ALREADY_READ');
      await this.outbox.publish({
        type: 'khata_page.queued',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { pageId },
      });
    });
    return this.getPage(storeId, pageId);
  }

  async getPage(storeId: string, pageId: string): Promise<KhataPageResponse> {
    const page = await this.findPage(storeId, pageId);
    const rows = await this.repository.rowsForPages(storeId, [pageId]);
    return this.toResponse(page, rows);
  }

  // The job's entry point. A page that is read, unreadable or failed is left alone, so a
  // redelivered job does nothing; one that crashed mid-read is taken over after its lease.
  async readPage(storeId: string, pageId: string, finalAttempt: boolean): Promise<void> {
    const now = this.clock.now();
    if (!(await this.repository.claim(storeId, pageId, now, new Date(now.getTime() - LEASE_MS))))
      return;
    const page = await this.findPage(storeId, pageId);
    const photo = await this.readPhoto(page);
    if (!photo) {
      await this.repository.finish(storeId, pageId, { status: 'failed', failureCode: 'model' });
      return;
    }
    // No transaction is open here: the model call can take a minute (docs/rules/database.md).
    const result = await this.ai.run(storeId, {
      tier: 'vision',
      purpose: 'khata_scan',
      prompt: readKhataPage,
      input: MODEL_INSTRUCTION,
      images: [photo],
      output: khataModelOutputSchema,
    });
    if (result.kind !== 'output') {
      const code = result.kind === 'failure' ? result.code : undefined;
      await this.handleModelFailure(storeId, pageId, code, finalAttempt);
      return;
    }
    const read = readKhataRows(result.output, this.clock.now());
    // Rule 8 and the blurry-page case: an unreadable page costs the shop nothing.
    if (read.length === 0) {
      await this.repository.finish(storeId, pageId, { status: 'unreadable' });
      return;
    }
    if (!(await this.charge(storeId, pageId))) return;
    await this.repository.saveRead(storeId, pageId, await this.withMatches(storeId, read));
  }

  // Undefined when the photo is gone or was purged.
  private async readPhoto(page: KhataPage) {
    if (!page.objectKey || !page.contentType) return undefined;
    const file = await this.storage.readBytes(page.objectKey, KHATA_PAGE_MAX_BYTES);
    return file.kind === 'found' ? { contentType: page.contentType, bytes: file.bytes } : undefined;
  }

  // An outage or a pause passes, so the queue tries the page again and only the last try fails it.
  // Any other failure would repeat itself, so it fails the page at once.
  private async handleModelFailure(
    storeId: string,
    pageId: string,
    code: string | undefined,
    finalAttempt: boolean,
  ): Promise<void> {
    const isTransient = code !== undefined && TRANSIENT_MODEL_FAILURES.has(code);
    if (isTransient && !finalAttempt) {
      await this.repository.releaseClaim(storeId, pageId);
      throw new Error(`Khata page read will be tried again: ${code}`);
    }
    await this.repository.finish(storeId, pageId, { status: 'failed', failureCode: 'model' });
  }

  private async charge(storeId: string, pageId: string): Promise<boolean> {
    try {
      // The page id is the reference, so a rerun after a crash is not charged again.
      await this.usage.consume(storeId, { unit: 'ai_scan', quantity: 1, reference: pageId });
      return true;
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'USAGE_ALLOWANCE_EXCEEDED') throw error;
      await this.repository.finish(storeId, pageId, { status: 'failed', failureCode: 'allowance' });
      return false;
    }
  }

  // Rule 4: an exact phone first, then the same name with a phone one digit away. A match is
  // only a suggestion; nothing is merged here.
  private async withMatches(storeId: string, rows: ReadKhataRow[]): Promise<MatchedRow[]> {
    const phones = [...new Set(rows.flatMap((row) => (row.phone ? [row.phone] : [])))];
    const exact = new Map(
      (await this.contacts.findImportMatches(storeId, phones)).map((c) => [c.phone, c.id]),
    );
    const unmatched = phones.filter((phone) => !exact.has(phone));
    const near = await this.contacts.findNearPhoneMatches(storeId, unmatched);
    return rows.map((row) => {
      const match = this.suggestMatch(row, exact, near);
      return { ...row, matchedContactId: match?.id ?? null, matchKind: match?.kind ?? null };
    });
  }

  private suggestMatch(
    row: ReadKhataRow,
    exact: Map<string, string>,
    near: { id: string; phone: string; name: string | null }[],
  ): { id: string; kind: KhataMatchKind } | undefined {
    const { phone } = row;
    if (!phone) return undefined;
    const exactId = exact.get(phone);
    if (exactId) return { id: exactId, kind: 'phone' };
    const similar = near.find(
      (contact) => differsByOneDigit(contact.phone, phone) && sharesName(contact.name, row.name),
    );
    return similar && { id: similar.id, kind: 'similar_phone' };
  }

  private async findPage(storeId: string, pageId: string): Promise<KhataPage> {
    const page = await this.repository.findPage(storeId, pageId);
    if (!page) throw khataScanError('KHATA_PAGE_NOT_FOUND');
    return page;
  }

  private toResponse(page: KhataPage, rows: StoredKhataRow[]): KhataPageResponse {
    const { objectKey } = page;
    const photoKept =
      objectKey !== null && page.photoExpiresAt !== null && page.photoExpiresAt > this.clock.now();
    return {
      id: page.id,
      status: page.status,
      failureCode: page.failureCode,
      photoUrl:
        photoKept && objectKey
          ? this.storage.createDownloadUrl(objectKey, PHOTO_LINK_SECONDS)
          : null,
      createdAt: page.createdAt.toISOString(),
      rows: rows.map((row) => ({
        id: row.id,
        rowNumber: row.rowNumber,
        entryDate: row.entryDate,
        name: row.name,
        phone: row.phone,
        item: row.item,
        amountPoisha: row.amountPoisha,
        kind: row.kind,
        confidence: row.confidence,
        needsCheck: row.confidence < KHATA_CONFIDENCE_THRESHOLD,
        match:
          row.matchedContactId && row.matchKind
            ? { contactId: row.matchedContactId, kind: row.matchKind }
            : null,
      })),
    };
  }
}

function differsByOneDigit(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let differing = 0;
  for (let index = 0; index < first.length; index += 1)
    if (first[index] !== second[index]) differing += 1;
  return differing === 1;
}

// Names are compared as written: any shared word counts, so "Mitu" matches "Mitu Akter".
function sharesName(contactName: string | null, rowName: string): boolean {
  if (!contactName) return false;
  const words = (name: string) =>
    name
      .toLowerCase()
      .split(/[\s.,]+/)
      .filter(Boolean);
  const contactWords = new Set(words(contactName));
  return words(rowName).some((word) => contactWords.has(word));
}
