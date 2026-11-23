import { z } from 'zod';

import { MAX_STOCK_QUANTITY, takaInput } from './products';

export const MAX_BULK_EDIT_PRODUCTS = 100;
export const BULK_EDIT_UNDO_HOURS = 24;
export const bulkEditStockReasons = ['Restock', 'Recount', 'Damage', 'Other'] as const;
export type BulkEditStockReason = (typeof bulkEditStockReasons)[number];

export const bulkEditFields = [
  'pricePoisha',
  'compareAtPricePoisha',
  'costPoisha',
  'stock',
  'categoryId',
  'brandId',
  'status',
] as const;
export type BulkEditField = (typeof bulkEditFields)[number];

const amount = z
  .number('Enter an amount')
  .int('Enter a whole amount')
  .positive('Enter an amount above zero')
  .max(Number.MAX_SAFE_INTEGER, 'That amount is too large');

// A field left out means "leave it as it is"; a blank cell is never sent.
const bulkEditRowSchema = z
  .strictObject({
    productId: z.uuid(),
    pricePoisha: amount.optional(),
    compareAtPricePoisha: amount.optional(),
    costPoisha: amount.optional(),
    stock: z
      .number('Enter a stock number')
      .int('Enter a whole number')
      .min(0, 'Stock cannot be negative')
      .max(MAX_STOCK_QUANTITY)
      .optional(),
    categoryId: z.uuid().optional(),
    brandId: z.uuid().optional(),
    status: z.enum(['active', 'hidden']).optional(),
  })
  .refine((row) => Object.keys(row).length > 1, 'Change at least one value');

export const applyProductBulkEditSchema = z
  .strictObject({
    rows: z
      .array(bulkEditRowSchema)
      .min(1, 'Choose at least one product')
      .max(MAX_BULK_EDIT_PRODUCTS, `Edit ${MAX_BULK_EDIT_PRODUCTS} products or fewer at once`),
    stockReason: z.enum(bulkEditStockReasons).optional(),
  })
  .superRefine((input, context) => {
    if (new Set(input.rows.map((row) => row.productId)).size !== input.rows.length)
      context.addIssue({ code: 'custom', path: ['rows'], message: 'Each product once' });
    if (input.rows.some((row) => row.stock !== undefined) && !input.stockReason)
      context.addIssue({
        code: 'custom',
        path: ['stockReason'],
        message: 'Choose a reason for the stock change',
      });
  });
export type ApplyProductBulkEditInput = z.infer<typeof applyProductBulkEditSchema>;
export type ProductBulkEditRow = z.infer<typeof bulkEditRowSchema>;

export type ProductBulkEditChange = {
  productId: string;
  // Set for cost and stock, which live on the product's only variant.
  variantId: string | null;
  field: BulkEditField;
  before: number | string | null;
  after: number | string;
};

export type ProductBulkEditResponse = {
  id: string;
  changedProducts: number;
  changedValues: number;
  createdAt: string;
  undoUntil: string;
};
export type ProductBulkEditListResponse = { items: ProductBulkEditResponse[] };
export type ProductBulkEditUndoResponse = { restored: number; skipped: number };

// The grid holds text. A blank cell becomes "leave as it is", so it can never overwrite a value.
const blankToUndefined = z.literal('').transform(() => undefined);
const gridTaka = z.union([blankToUndefined, takaInput.pipe(amount)], {
  error: 'Enter Taka with at most two decimal places, above zero',
});
const gridCount = z.union(
  [
    blankToUndefined,
    z
      .string()
      .regex(/^\d+$/, 'Enter a whole number')
      .transform(Number)
      .pipe(z.number().max(MAX_STOCK_QUANTITY, 'That is too many')),
  ],
  { error: 'Enter a whole number' },
);
export const productBulkEditFormSchema = z.strictObject({
  rows: z.array(
    z.strictObject({
      productId: z.uuid(),
      pricePoisha: gridTaka,
      compareAtPricePoisha: gridTaka,
      costPoisha: gridTaka,
      stock: gridCount,
      categoryId: z.uuid().or(z.literal('').transform(() => undefined)),
      brandId: z.uuid().or(z.literal('').transform(() => undefined)),
      status: z.enum(['active', 'hidden']),
    }),
  ),
  stockReason: z.enum(bulkEditStockReasons).or(z.literal('')),
});
export type ProductBulkEditFormValues = z.input<typeof productBulkEditFormSchema>;
export type ProductBulkEditFormInput = z.output<typeof productBulkEditFormSchema>;
