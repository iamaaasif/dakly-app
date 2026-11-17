import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CreateProductInput,
  ChangeProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductResponse,
} from '@dakly/contracts/products';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { productError } from './products.errors';
import { type Product, ProductsRepository, type Variant } from './products.repository';

type Actor = AuditEntry['actor'];

@Injectable()
export class ProductsService {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  create(storeId: string, input: CreateProductInput, _actor: Actor): Promise<ProductResponse> {
    return this.transaction.run(storeId, async () => {
      const { variants, ...details } = input;
      if (variants.some((variant) => variant.id)) throw productError('PRODUCT_VARIANT_NOT_FOUND');
      const product = await this.repository.insert(storeId, details, this.clock.now());
      await this.saveVariants(storeId, product, variants, []);
      await this.publishUpdated(storeId, product.id);
      return this.getById(storeId, product.id);
    });
  }

  edit(
    storeId: string,
    id: string,
    input: ChangeProductInput,
    _actor: Actor,
  ): Promise<ProductResponse> {
    return this.transaction.run(storeId, async () => {
      const { variants, ...details } = input;
      const product = await this.repository.update(storeId, id, details, this.clock.now());
      if (!product) throw productError('PRODUCT_NOT_FOUND');
      if (variants) {
        const current = await this.repository.findVariants(storeId, [id]);
        await this.saveVariants(storeId, product, variants, current);
      }
      await this.publishUpdated(storeId, id);
      return this.getById(storeId, id);
    });
  }

  async getById(storeId: string, id: string): Promise<ProductResponse> {
    const product = await this.repository.findById(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return toResponse(product, product.variants);
  }

  async list(storeId: string, query: ProductListQuery): Promise<ProductListResponse> {
    const rows = await this.repository.list(storeId, query);
    const page = rows.slice(0, query.limit);
    const items = page.map((product) => toResponse(product, product.variants));
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  remove(storeId: string, id: string, _actor: Actor): Promise<void> {
    return this.transaction.run(storeId, async () => {
      if (!(await this.repository.archive(storeId, id, this.clock.now())))
        throw productError('PRODUCT_NOT_FOUND');
      await this.publishUpdated(storeId, id);
    });
  }

  private async saveVariants(
    storeId: string,
    product: Product,
    input: CreateProductInput['variants'],
    current: Variant[],
  ) {
    const variants = input.length
      ? input
      : [
          {
            id: current.find((variant) => variant.isDefault)?.id,
            optionValues: {},
            sku: null,
            priceOverridePoisha: null,
            costPoisha: null,
          },
        ];
    if (variants.some((variant) => variant.id && !current.some((row) => row.id === variant.id)))
      throw productError('PRODUCT_VARIANT_NOT_FOUND');
    const saved = await this.repository.saveVariants(
      storeId,
      product.id,
      variants.map((variant, position) => ({
        ...variant,
        position,
        isDefault: product.options.length === 0,
        title: product.options.length
          ? product.options.map((option) => variant.optionValues[option.name]).join(' / ')
          : 'Default',
      })),
      this.clock.now(),
    );
    if (!saved) throw productError('PRODUCT_SKU_TAKEN');
  }

  private publishUpdated(storeId: string, productId: string) {
    return this.outbox.publish({
      type: 'product.updated',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { productId },
    });
  }
}

function toResponse(product: Product, variants: Variant[]): ProductResponse {
  if (product.status === 'archived') throw productError('PRODUCT_NOT_FOUND');
  return {
    ...product,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: variants.map(({ productId: _productId, ...variant }) => ({
      ...variant,
      pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
      available: variant.onHand - variant.reserved,
    })),
  };
}
