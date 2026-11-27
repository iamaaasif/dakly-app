import { z } from 'zod';

const listName = z.string().trim().min(1, 'Enter a name').max(100, 'Use 100 characters or fewer');

export const createProductCategorySchema = z.strictObject({
  name: listName,
  // A category has one parent at most, so a parent cannot itself have one.
  parentId: z.uuid().nullable().default(null),
});
export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;

export const changeProductCategorySchema = z
  .strictObject({
    name: listName.optional(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one value');
export type ChangeProductCategoryInput = z.infer<typeof changeProductCategorySchema>;

export const productBrandSchema = z.strictObject({ name: listName });
export type ProductBrandInput = z.infer<typeof productBrandSchema>;

export type ProductCategoryResponse = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
};
export type ProductBrandResponse = { id: string; name: string; productCount: number };
export type ProductCategoryListResponse = { items: ProductCategoryResponse[] };
export type ProductBrandListResponse = { items: ProductBrandResponse[] };

// A category in a file or in a search reads "Clothing > T-shirts".
export const CATEGORY_PATH_SEPARATOR = ' > ';
