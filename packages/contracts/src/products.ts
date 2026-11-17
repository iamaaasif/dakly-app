import { z } from 'zod';

export const productStatuses = ['active', 'hidden', 'archived'] as const;
export const stockMovementKinds = [
  'reserve',
  'release',
  'ship',
  'return',
  'adjust',
  'import',
] as const;
export const restockRequestStatuses = ['waiting', 'notified', 'cancelled'] as const;

const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = z.string().trim().min(1).max(200);
const optionSchema = z.strictObject({
  name: text,
  values: z
    .array(text)
    .min(1)
    .max(100)
    .refine((values) => new Set(values).size === values.length, 'Repeated option value'),
});
const variantSchema = z.strictObject({
  id: z.uuid().optional(),
  optionValues: z.record(z.string(), text).default({}),
  sku: text.nullable().default(null),
  priceOverridePoisha: money.nullable().default(null),
  costPoisha: money.nullable().default(null),
});

export const createProductSchema = z
  .strictObject({
    name: text,
    description: z.string().trim().max(10000).nullable().default(null),
    category: text.nullable().default(null),
    aliases: z.array(text).max(100).default([]),
    pricePoisha: money.default(0),
    compareAtPricePoisha: money.nullable().default(null),
    options: z.array(optionSchema).max(3).default([]),
    variants: z.array(variantSchema).max(100).default([]),
    isStockTracked: z.boolean().default(true),
    isVisibleInChats: z.boolean().default(true),
    isVisibleInOrderLink: z.boolean().default(true),
    status: z.enum(['active', 'hidden']).default('active'),
  })
  .superRefine(validateVariants);

function validateVariants(
  product: { options: z.infer<typeof optionSchema>[]; variants: z.infer<typeof variantSchema>[] },
  context: z.RefinementCtx,
) {
  const names = product.options.map((option) => option.name);
  const combinations = product.variants.map((variant) =>
    JSON.stringify(names.map((name) => variant.optionValues[name])),
  );
  const invalidVariant = product.variants.some(
    (variant) =>
      Object.keys(variant.optionValues).length !== names.length ||
      product.options.some((option) => !option.values.includes(variant.optionValues[option.name]!)),
  );
  const ids = product.variants.flatMap((variant) => (variant.id ? [variant.id] : []));
  if (
    new Set(names).size !== names.length ||
    invalidVariant ||
    new Set(combinations).size !== combinations.length ||
    new Set(ids).size !== ids.length ||
    (names.length > 0 && product.variants.length === 0) ||
    (names.length === 0 && product.variants.length > 1)
  )
    context.addIssue({
      code: 'custom',
      path: ['variants'],
      message: 'Use distinct variants that match the product options',
    });
}

export const changeProductSchema = z
  .strictObject({
    name: text.optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    category: text.nullable().optional(),
    aliases: z.array(text).max(100).optional(),
    pricePoisha: money.optional(),
    compareAtPricePoisha: money.nullable().optional(),
    options: z.array(optionSchema).max(3).optional(),
    variants: z.array(variantSchema).max(100).optional(),
    isStockTracked: z.boolean().optional(),
    isVisibleInChats: z.boolean().optional(),
    isVisibleInOrderLink: z.boolean().optional(),
    status: z.enum(['active', 'hidden']).optional(),
  })
  .superRefine((change, context) => {
    if (!Object.keys(change).length)
      context.addIssue({ code: 'custom', message: 'Nothing to change' });
    if ((change.options === undefined) !== (change.variants === undefined))
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Change options and variants together',
      });
    if (change.options && change.variants)
      validateVariants({ options: change.options, variants: change.variants }, context);
  });

export type ChangeProductInput = z.infer<typeof changeProductSchema>;

export const productListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(3).max(200).optional(),
  readiness: z.enum(['needs_price', 'needs_photo', 'hidden']).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductOption = z.infer<typeof optionSchema>;
export type ProductVariantResponse = Omit<z.infer<typeof variantSchema>, 'id'> & {
  id: string;
  title: string;
  isDefault: boolean;
  pricePoisha: number;
  onHand: number;
  reserved: number;
  available: number;
};
export type ProductResponse = Omit<CreateProductInput, 'variants'> & {
  id: string;
  imageFileIds: string[];
  variants: ProductVariantResponse[];
  createdAt: string;
  updatedAt: string;
};
export type ProductListResponse = { items: ProductResponse[]; nextCursor: string | null };
