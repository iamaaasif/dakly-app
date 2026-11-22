import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CreateImportInput,
  ImportResponse,
  ImportUploadResponse,
} from '@dakly/contracts/contacts';
import {
  type ProductImportDryRun,
  type StartProductImportInput,
  productImportMappingSchema,
} from '@dakly/contracts/product-imports';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import {
  type ImportedRow,
  type ImportProduct,
  ProductImportService,
} from '../products/product-import.service';
import { readCsvLines } from './csv-records';
import { type ImportRun, ImportRunner } from './import-runner';
import type { ImportCounts, ImportReportLine as ReportLine } from './imports.repository';
import { readProductImportRows } from './product-import-rows';
import { ProductImportsRepository } from './product-imports.repository';

type Actor = AuditEntry['actor'];

// A batch is up to 25 products, so its variants, stock moves and events stay in a short transaction.
const BATCH_PRODUCTS = 25;
const FIELD_LABELS = {
  name: 'Name',
  price: 'Price',
  category: 'Category',
  description: 'Description',
  status: 'Status',
  sku: 'SKU',
  cost: 'Cost',
  onHand: 'On hand',
} as const satisfies Record<string, string>;
const COUNT_FOR_OUTCOME = {
  added: 'rowsAdded',
  updated: 'rowsUpdated',
  skipped: 'rowsSkipped',
  failed: 'rowsFailed',
} as const satisfies Record<ImportedRow['outcome'], keyof ImportCounts>;

const MAX_DRY_RUN_ROWS = 300;

// The file's cells under the names the screen shows: field labels, and option names as typed.
function rawCells(cells: string[], { mapping }: StartProductImportInput): Record<string, string> {
  const { options, ...fields } = mapping;
  return Object.fromEntries([
    ...Object.entries(fields).map(([field, column]) => [field, cells[column] ?? '']),
    ...options.map(({ name, column }) => [`option:${name}`, cells[column] ?? '']),
  ]);
}

@Injectable()
export class ProductImportsService {
  private readonly runner: ImportRunner<ImportProduct>;

  constructor(
    @Inject(ProductImportsRepository) private readonly repository: ProductImportsRepository,
    @Inject(ProductImportService) private readonly products: ProductImportService,
    @Inject(StoreTransaction) transaction: StoreTransaction,
    @Inject(OutboxService) outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) storage: FileStorageDriver,
    @Inject(RateLimiter) limiter: RateLimiter,
  ) {
    this.runner = new ImportRunner(
      { repository, transaction, outbox, clock, storage, limiter },
      {
        name: 'product-import',
        startedEvent: 'product_import.started',
        batchSize: BATCH_PRODUCTS,
        fieldLabels: FIELD_LABELS,
        readFile: (text, found) => {
          const { products, errors } = readProductImportRows(
            text,
            productImportMappingSchema.parse(found.columnMapping),
          );
          const rowsFailed = new Set(errors.map((error) => error.rowNumber)).size;
          const variants = products.reduce((sum, product) => sum + product.variants.length, 0);
          return { rows: products, errors, rowsFailed, rowsTotal: variants + rowsFailed };
        },
        writeBatch: (run, batch, counts) => this.writeBatch(run, batch, counts),
      },
    );
  }

  create(storeId: string, input: CreateImportInput, actor: Actor): Promise<ImportUploadResponse> {
    return this.runner.create(storeId, input.sizeBytes, actor);
  }

  async start(
    storeId: string,
    importId: string,
    input: StartProductImportInput,
    actor: Actor,
  ): Promise<ImportResponse> {
    await this.runner.start(storeId, importId, {
      columnMapping: input.mapping,
      duplicateMode: input.duplicateMode,
      consentEvidence: null,
      hasConsentConfirmation: false,
      startedAt: this.clock.now(),
      startedByUserId: actor.kind === 'user' ? actor.userId : null,
    });
    return this.get(storeId, importId);
  }

  get(storeId: string, importId: string): Promise<ImportResponse> {
    return this.runner.get(storeId, importId);
  }

  // Says what the import would do, row by row, and writes nothing. The rows shown are limited,
  // rejected ones first, so a bad row is never hidden behind good ones.
  async dryRun(
    storeId: string,
    importId: string,
    input: StartProductImportInput,
  ): Promise<ProductImportDryRun> {
    const { text, file } = await this.runner.readBeforeStart(storeId, importId, input.mapping);
    const previewed = await this.products.preview(storeId, file.rows, input.duplicateMode);
    const rejected = file.errors.map((error) => ({
      rowNumber: error.rowNumber ?? 0,
      result: 'rejected' as const,
      problem: error.message,
      wasPricePoisha: null,
    }));
    const all = [...previewed, ...rejected];
    const counts = { added: 0, changed: 0, skipped: 0, rejected: 0 };
    for (const { result } of all) counts[result] += 1;
    const raw = new Map(readCsvLines(text).lines.map((line) => [line.rowNumber, line.cells]));
    const shown = [...all]
      .sort((a, b) => Number(b.result === 'rejected') - Number(a.result === 'rejected'))
      .slice(0, MAX_DRY_RUN_ROWS)
      .sort((a, b) => a.rowNumber - b.rowNumber);
    return {
      counts,
      rows: shown.map((row) => ({ ...row, cells: rawCells(raw.get(row.rowNumber) ?? [], input) })),
      rowsShown: shown.length,
      errors: file.errors.map(({ rowNumber, field, message }) => ({
        rowNumber: rowNumber ?? 0,
        field: field ? (FIELD_LABELS[field as keyof typeof FIELD_LABELS] ?? field) : '',
        message,
      })),
    };
  }

  run(storeId: string, importId: string): Promise<void> {
    return this.runner.run(storeId, importId);
  }

  async sweepStuckImports(): Promise<void> {
    const before = this.runner.stuckBefore();
    await this.runner.sweepStuck(await this.repository.storesWithStuckImports(before), before);
  }

  private async writeBatch(
    { storeId, found, actor }: ImportRun,
    batch: ImportProduct[],
    counts: ImportCounts,
  ): Promise<ReportLine[]> {
    const mapping = productImportMappingSchema.parse(found.columnMapping);
    const results = await this.products.importBatch(storeId, batch, {
      duplicateMode: found.duplicateMode,
      importId: found.id,
      actor,
      tracksStock: mapping.onHand !== undefined,
    });
    for (const { outcome } of results) counts[COUNT_FOR_OUTCOME[outcome]] += 1;
    return results.flatMap(({ rowNumber, message }) => (message ? [{ rowNumber, message }] : []));
  }
}
