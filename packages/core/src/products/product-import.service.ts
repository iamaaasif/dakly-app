import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { ImportDuplicateMode } from '@dakly/contracts/contacts';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductBrandsService } from './product-brands.service';
import { ProductCategoriesService } from './product-categories.service';
import { matchProblem, type PreviewedRow, previewRows } from './product-import-preview';
import type { ImportProduct, ImportVariant } from './product-import-types';
import { ProductStockService } from './product-stock.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import type { SkuMatch } from './sku-match.repository';

export type { ImportProduct, ImportVariant } from './product-import-types';

type Actor = AuditEntry['actor'];

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
    @Inject(ProductCategoriesService) private readonly categories: ProductCategoriesService,
    @Inject(ProductBrandsService) private readonly brands: ProductBrandsService,
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

  // What importBatch would do, read from the shop as it is now. Nothing is written.
  async preview(
    storeId: string,
    batch: ImportProduct[],
    duplicateMode: ImportDuplicateMode,
  ): Promise<PreviewedRow[]> {
    const skus = batch.flatMap(({ variants }) => variants.flatMap(({ sku }) => sku ?? []));
    const matches = new Map(
      (skus.length ? await this.repository.findVariantsBySku(storeId, skus) : []).map((match) => [
        match.sku,
        match,
      ]),
    );
    const brandNames = await this.brands.matchNames(
      storeId,
      batch.flatMap(({ brand }) => brand ?? []),
    );
    const resolved = batch.map((product) => ({
      ...product,
      brand: product.brand === null ? null : (brandNames.get(product.brand) ?? product.brand),
    }));
    return previewRows(resolved, matches, duplicateMode);
  }

  private async addProduct(
    storeId: string,
    { variants, category, brand, ...details }: ImportProduct,
    context: ImportContext,
  ): Promise<ImportedRow[]> {
    const created = await this.products.create(
      storeId,
      {
        ...details,
        categoryId:
          category === null ? null : (await this.categories.resolvePath(storeId, category)).id,
        brandId: brand === null ? null : await this.brands.resolveName(storeId, brand),
        status: details.status ?? 'active',
        shortDescription: null,
        barcode: null,
        tags: [],
        collectionIds: [],
        aliases: [],
        weightGrams: null,
        compareAtPricePoisha: null,
        negotiationEnabled: false,
        negotiationOpeningPoisha: null,
        negotiationFloorPoisha: null,
        isStockTracked: context.tracksStock,
        stockStatus: 'in_stock',
        allowOrdersWhenOutOfStock: false,
        isVisibleInChats: true,
        isVisibleInOrderLink: true,
        variants: variants.map(({ sku, optionValues, priceOverridePoisha, costPoisha }) => ({
          sku,
          optionValues,
          priceOverridePoisha,
          costPoisha,
          lowStockThreshold: null,
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
    product: ImportProduct,
    matches: Map<string, SkuMatch>,
    context: ImportContext,
  ): Promise<ImportedRow[]> {
    const { variants } = product;
    // The product price has one target: the product of the first matching SKU.
    const targetProductId = variants.flatMap(({ sku }) => (sku ? (matches.get(sku) ?? []) : []))[0]
      ?.productId;
    const results: ImportedRow[] = [];
    const updates: { match: SkuMatch; variant: ImportVariant }[] = [];
    for (const variant of variants) {
      const match = variant.sku ? matches.get(variant.sku) : undefined;
      const { rowNumber } = variant;
      const problem = matchProblem(match, targetProductId);
      if (problem) results.push({ rowNumber, outcome: 'failed', message: problem });
      else if (context.duplicateMode === 'skip') results.push({ rowNumber, outcome: 'skipped' });
      else {
        updates.push({ match: match!, variant });
        results.push({ rowNumber, outcome: 'updated' });
      }
    }
    if (updates.length > 0) {
      const productId = targetProductId!;
      const changesVariantPrices = updates.some(
        ({ variant }) => variant.costPoisha !== null || variant.priceOverridePoisha !== null,
      );
      // Lock the product before its variants, in the same order as the editor.
      await this.updateProduct(storeId, productId, product, changesVariantPrices);
      for (const { match, variant } of updates)
        await this.updateVariant(storeId, match, variant, context);
      await this.outbox.publish({
        type: 'product.updated',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { productId },
      });
    }
    return results;
  }

  private async updateVariant(
    storeId: string,
    match: SkuMatch,
    { priceOverridePoisha, costPoisha, onHand }: ImportVariant,
    context: ImportContext,
  ): Promise<void> {
    // A blank or repeated price leaves an existing price override as it is.
    if (priceOverridePoisha !== null || costPoisha !== null)
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
    { pricePoisha, category, brand, description, status }: ImportProduct,
    changesVariantPrices: boolean,
  ): Promise<void> {
    // A blank cell never overwrites what the shop already has.
    const changes = {
      ...(pricePoisha > 0 ? { pricePoisha } : {}),
      ...(category === null
        ? {}
        : { categoryId: (await this.categories.resolvePath(storeId, category)).id }),
      ...(brand === null ? {} : { brandId: await this.brands.resolveName(storeId, brand) }),
      ...(description === null ? {} : { description }),
      ...(status === undefined ? {} : { status }),
    };
    if (changesVariantPrices || Object.keys(changes).length > 0)
      await this.repository.update(storeId, productId, changes, this.clock.now());
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
