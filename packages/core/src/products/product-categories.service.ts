import { Inject, Injectable } from '@nestjs/common';

import {
  CATEGORY_PATH_SEPARATOR,
  type ChangeProductCategoryInput,
  type CreateProductCategoryInput,
  type ProductCategoryListResponse,
  type ProductCategoryResponse,
} from '@dakly/contracts/product-lists';

import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductCategoriesRepository, type ProductCategory } from './product-categories.repository';
import { productError } from './products.errors';

@Injectable()
export class ProductCategoriesService {
  constructor(
    @Inject(ProductCategoriesRepository) private readonly repository: ProductCategoriesRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async list(storeId: string): Promise<ProductCategoryListResponse> {
    return { items: await this.repository.list(storeId) };
  }

  create(storeId: string, input: CreateProductCategoryInput): Promise<ProductCategoryResponse> {
    return this.transaction.run(storeId, async () => {
      const category = await this.insertCategory(storeId, input.parentId, input.name);
      return { ...category, productCount: 0 };
    });
  }

  change(
    storeId: string,
    id: string,
    input: ChangeProductCategoryInput,
  ): Promise<ProductCategoryResponse> {
    return this.transaction.run(storeId, async () => {
      const current = await this.require(storeId, id);
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      const name = input.name ?? current.name;
      if (parentId !== current.parentId && parentId !== null)
        await this.assertCanMoveUnder(storeId, id, parentId);
      if (await this.repository.findByName(storeId, parentId, name, id))
        throw productError('PRODUCT_CATEGORY_NAME_TAKEN');
      const change = { name, parentId, sortOrder: input.sortOrder ?? current.sortOrder };
      if (!(await this.repository.update(storeId, id, change)))
        throw productError('PRODUCT_CATEGORY_NAME_TAKEN');
      const updated = (await this.repository.list(storeId)).find((item) => item.id === id);
      if (!updated) throw productError('PRODUCT_CATEGORY_NOT_FOUND');
      return updated;
    });
  }

  remove(storeId: string, id: string): Promise<void> {
    return this.transaction.run(storeId, async () => {
      await this.require(storeId, id);
      if (
        (await this.repository.hasChildren(storeId, id)) ||
        (await this.repository.hasProducts(storeId, id))
      )
        throw productError('PRODUCT_CATEGORY_IN_USE');
      await this.repository.delete(storeId, id);
    });
  }

  async assertExists(storeId: string, id: string): Promise<void> {
    await this.require(storeId, id);
  }

  // For a file or an edit that names a category ("Clothing > T-shirts"): an existing one is
  // found by name, ignoring case, and a missing one is added.
  async resolvePath(storeId: string, path: string): Promise<{ id: string; path: string }> {
    const names = path
      .split(CATEGORY_PATH_SEPARATOR.trim())
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 0 || names.length > 2) throw productError('PRODUCT_CATEGORY_TOO_DEEP');
    return this.transaction.run(storeId, async () => {
      let parentId: string | null = null;
      const found: ProductCategory[] = [];
      for (const name of names) {
        const category: ProductCategory =
          (await this.repository.findByName(storeId, parentId, name)) ??
          (await this.insertCategory(storeId, parentId, name));
        found.push(category);
        parentId = category.id;
      }
      const leaf = found.at(-1);
      if (!leaf) throw productError('PRODUCT_CATEGORY_NOT_FOUND');
      return {
        id: leaf.id,
        path: found.map((category) => category.name).join(CATEGORY_PATH_SEPARATOR),
      };
    });
  }

  // A category with sub-categories of its own cannot move under another one.
  private async assertCanMoveUnder(storeId: string, id: string, parentId: string): Promise<void> {
    const parent = await this.require(storeId, parentId);
    if (
      parent.parentId !== null ||
      parent.id === id ||
      (await this.repository.hasChildren(storeId, id))
    )
      throw productError('PRODUCT_CATEGORY_TOO_DEEP');
  }

  private async insertCategory(
    storeId: string,
    parentId: string | null,
    name: string,
  ): Promise<ProductCategory> {
    if (parentId !== null && (await this.require(storeId, parentId)).parentId !== null)
      throw productError('PRODUCT_CATEGORY_TOO_DEEP');
    if (await this.repository.findByName(storeId, parentId, name))
      throw productError('PRODUCT_CATEGORY_NAME_TAKEN');
    const category = { id: newId(), name, parentId };
    if (!(await this.repository.insert(storeId, category)))
      throw productError('PRODUCT_CATEGORY_NAME_TAKEN');
    return { ...category, sortOrder: 0 };
  }

  private async require(storeId: string, id: string): Promise<ProductCategory> {
    const category = await this.repository.find(storeId, id);
    if (!category) throw productError('PRODUCT_CATEGORY_NOT_FOUND');
    return category;
  }
}
