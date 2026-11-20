import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { ImportDuplicateMode } from '@dakly/contracts/contacts';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductStockService } from './product-stock.service';
import { ProductsRepository, type SkuMatch } from './products.repository';
import { ProductsService } from './products.service';

type Actor = AuditEntry['actor'];

export type ImportVariant = {
  rowNumber: number;
  sku: string | null;
  optionValues: Record<string, string>;
  priceOverridePoisha: number | null;
  costPoisha: number | null;
  onHand: number | undefined;
};

export type ImportProduct = {
  name: string;
  category: string | null;
  description: string | null;
  status: 'active' | 'hidden';
  pricePoisha: number;
  options: { name: string; values: string[] }[];
  variants: ImportVariant[];
};

export type ImportedRow = {
  rowNumber: number;
  outcome: 'added' | 'updated' | 'skipped' | 'failed';
  message?: string;
};

type ImportContext = {
  duplicateMode: ImportDuplicateMode;
  importId: string;
  actor: Actor;
  // New products track stock only when the file brings counts for it.
  tracksStock: boolean;
};

// Writes one batch of a product import in the caller's transaction, so the import's progress and
// the products it changed commit together and a retried batch never applies a count twice.
@Injectable()
export class ProductImportService {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductStockService) private readonly stock: ProductStockService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  importBatch(
    storeId: string,
    batch: ImportProduct[],
    context: ImportContext,
  ): Promise<ImportedRow[]> {
    return this.transaction.run(storeId, async () => {
      const skus = batch.flatMap(({ variants }) => variants.flatMap(({ sku }) => sku ?? []));
      const matches = new Map(
        (skus.length ? await this.repository.findVariantsBySku(storeId, skus) : []).map((match) => [
          match.sku,
          match,
        ]),
      );
      const results: ImportedRow[] = [];
      for (const product of batch) {
        const matched = product.variants.some(({ sku }) => sku && matches.has(sku));
        results.push(
          ...(matched
            ? await this.updateExisting(storeId, product, matches, context)
            : await this.addProduct(storeId, product, context)),
        );
      }
      return results;
    });
  }

  private async addProduct(
    storeId: string,
    { variants, ...details }: ImportProduct,
    context: ImportContext,
  ): Promise<ImportedRow[]> {
    const created = await this.products.create(
      storeId,
      {
        ...details,
        aliases: [],
        compareAtPricePoisha: null,
        isStockTracked: context.tracksStock,
        isVisibleInChats: true,
        isVisibleInOrderLink: true,
        variants: variants.map(({ sku, optionValues, priceOverridePoisha, costPoisha }) => ({
          sku,
          optionValues,
          priceOverridePoisha,
          costPoisha,
        })),
      },
      context.actor,
    );
    // The created variants keep the order of the file's rows.
    for (const [index, variant] of variants.entries())
      await this.setOnHand(storeId, created.variants[index]!.id, variant.onHand, context);
    return variants.map(({ rowNumber }) => ({ rowNumber, outcome: 'added' }));
  }

  // A SKU already in the shop finds its variant. Rows with a new SKU in the same product are
  // reported rather than guessed at, because adding a size belongs in the product editor.
  private async updateExisting(
    storeId: string,
    { variants, pricePoisha }: ImportProduct,
    matches: Map<string, SkuMatch>,
    context: ImportContext,
  ): Promise<ImportedRow[]> {
    // The product price has one target: the product of the first matching SKU.
    const targetProductId = variants.flatMap(({ sku }) => (sku ? (matches.get(sku) ?? []) : []))[0]
      ?.productId;
    const results: ImportedRow[] = [];
    let updated = 0;
    for (const variant of variants) {
      const match = variant.sku ? matches.get(variant.sku) : undefined;
      const { rowNumber } = variant;
      const problem = matchProblem(match, targetProductId);
      if (problem) results.push({ rowNumber, outcome: 'failed', message: problem });
      else if (context.duplicateMode === 'skip') results.push({ rowNumber, outcome: 'skipped' });
      else {
        await this.updateVariant(storeId, match!, variant, context);
        updated += 1;
        results.push({ rowNumber, outcome: 'updated' });
      }
    }
    if (updated > 0) await this.updateProduct(storeId, targetProductId!, pricePoisha);
    return results;
  }

  private async updateVariant(
    storeId: string,
    match: SkuMatch,
    { priceOverridePoisha, costPoisha, onHand }: ImportVariant,
    context: ImportContext,
  ): Promise<void> {
    // A blank or repeated price leaves an existing price override as it is.
    await this.repository.updateVariantPrices(
      storeId,
      match.id,
      {
        ...(priceOverridePoisha === null ? {} : { priceOverridePoisha }),
        ...(costPoisha === null ? {} : { costPoisha }),
      },
      this.clock.now(),
    );
    await this.setOnHand(storeId, match.id, onHand, context);
  }

  private async updateProduct(
    storeId: string,
    productId: string,
    pricePoisha: number,
  ): Promise<void> {
    if (pricePoisha > 0)
      await this.repository.update(storeId, productId, { pricePoisha }, this.clock.now());
    await this.outbox.publish({
      type: 'product.updated',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { productId },
    });
  }

  // A blank cell leaves stock alone. A product that does not track stock ignores the count, which
  // the ledger enforces.
  private async setOnHand(
    storeId: string,
    variantId: string,
    onHand: number | undefined,
    { importId, actor }: { importId: string; actor: Actor },
  ): Promise<void> {
    if (onHand === undefined) return;
    await this.stock.moveStock(storeId, variantId, {
      kind: 'import',
      onHand,
      reference: { actor, reason: `Product import ${importId}` },
    });
  }
}

function matchProblem(match: SkuMatch | undefined, targetProductId: string | undefined) {
  if (!match) return 'A size of an existing product needs a SKU that is already in the shop';
  if (match.productId !== targetProductId) return 'These SKUs belong to different products';
  if (match.isArchived) return 'This SKU belongs to an archived product';
  return undefined;
}
