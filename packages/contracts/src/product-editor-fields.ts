import { z } from 'zod';

export const productStockStatuses = ['in_stock', 'out_of_stock'] as const;
type ProductStockStatus = (typeof productStockStatuses)[number];

const optionText = z
  .string()
  .trim()
  .min(1, 'Enter a value')
  .max(200, 'Use 200 characters or fewer');
const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1A2B3C');
export const productOptionSchema = z
  .strictObject({
    name: optionText,
    values: z
      .array(optionText)
      .min(1, 'Add at least one value')
      .max(100, 'Use 100 values or fewer')
      .refine((values) => new Set(values).size === values.length, 'Each value must be different'),
    // A swatch colour for some of the values, for example Red: #D32F2F.
    colors: z.record(z.string(), hexColour).optional(),
  })
  .refine(
    ({ values, colors }) => !colors || Object.keys(colors).every((value) => values.includes(value)),
    { path: ['colors'], message: 'A colour must belong to one of the values' },
  );

export const productEditorFields = {
  shortDescription: z
    .string()
    .trim()
    .max(300, 'Use 300 characters or fewer')
    .nullable()
    .default(null),
  barcode: z.string().trim().min(1).max(64, 'Use 64 characters or fewer').nullable().default(null),
  // Tags are created by name when a product first uses them.
  tags: z
    .array(z.string().trim().min(1, 'Enter a tag').max(50, 'Use 50 characters or fewer'))
    .max(30, 'Use 30 tags or fewer')
    .default([]),
  collectionIds: z.array(z.uuid()).max(30).default([]),
  // Read only when stock is not tracked; a tracked product follows its available count.
  stockStatus: z.enum(productStockStatuses).default('in_stock'),
  // Lets staff add this product to a manual order with no stock. Chats and the order link
  // never offer it.
  allowOrdersWhenOutOfStock: z.boolean().default(false),
};

// On a change, a field left out keeps its stored value, so none of these may apply a default.
export const productEditorChanges = {
  shortDescription: productEditorFields.shortDescription.unwrap().optional(),
  barcode: productEditorFields.barcode.unwrap().optional(),
  tags: productEditorFields.tags.unwrap().optional(),
  collectionIds: productEditorFields.collectionIds.unwrap().optional(),
  stockStatus: productEditorFields.stockStatus.unwrap().optional(),
  allowOrdersWhenOutOfStock: productEditorFields.allowOrdersWhenOutOfStock.unwrap().optional(),
};

// What a customer in a chat, the order link or a photo match may be offered. A tracked product
// follows its available count; an untracked one follows the status the owner set. The
// allowOrdersWhenOutOfStock switch is deliberately not read here: it is for manual orders only.
export function isInStock(
  product: Pick<ProductCatalogueHead, 'isStockTracked' | 'stockStatus'>,
  available: number,
): boolean {
  return product.isStockTracked ? available > 0 : product.stockStatus === 'in_stock';
}

export type ProductCatalogueHead = {
  id: string;
  name: string;
  isStockTracked: boolean;
  stockStatus: ProductStockStatus;
  allowOrdersWhenOutOfStock: boolean;
};

export const optionalTextInput = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null);

// The same fields as a form sends them, where a blank box means none.
export const productEditorFormFields = {
  shortDescription: optionalTextInput
    .pipe(productEditorFields.shortDescription.unwrap())
    .default(null),
  barcode: optionalTextInput.pipe(productEditorFields.barcode.unwrap()).default(null),
};
