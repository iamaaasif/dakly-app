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
  optionValues: z.record(z.string(), text).default({}),
  sku: text.nullable().default(null),
  priceOverridePoisha: money.positive().nullable().default(null),
  costPoisha: money.nullable().default(null),
});

const editVariantSchema = variantSchema.extend({ id: z.uuid().optional() });

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
  product: {
    options: z.infer<typeof optionSchema>[];
    variants: z.infer<typeof editVariantSchema>[];
  },
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
    variants: z.array(editVariantSchema).max(100).optional(),
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

export const takaInput = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Enter Taka with at most two decimal places')
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return Number(BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')));
  })
  .pipe(money);
const optionalTakaInput = z.union([z.literal('').transform(() => null), takaInput]);
const optionalTextInput = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null);

export const productFormSchema = z
  .strictObject({
    ...createProductSchema.shape,
    category: optionalTextInput.pipe(createProductSchema.shape.category.unwrap()).default(null),
    description: optionalTextInput
      .pipe(createProductSchema.shape.description.unwrap())
      .default(null),
    aliases: z
      .array(z.string())
      .transform((values) => values.filter((value) => value.trim()))
      .pipe(createProductSchema.shape.aliases.unwrap())
      .default([]),
    pricePoisha: z.union([z.literal('').transform(() => 0), takaInput]).default(0),
    compareAtPricePoisha: optionalTakaInput.default(null),
    variants: z
      .array(
        z.strictObject({
          ...editVariantSchema.shape,
          sku: optionalTextInput.pipe(editVariantSchema.shape.sku.unwrap()).default(null),
          priceOverridePoisha: optionalTakaInput.pipe(money.positive().nullable()).default(null),
          costPoisha: optionalTakaInput.default(null),
          initialStock: z.number().int().min(0).default(0),
        }),
      )
      .max(100)
      .default([]),
  })
  // Positions keep selections attached while option names are being edited.
  .transform((input) => ({
    ...input,
    variants: input.variants.map(({ initialStock: _stock, ...variant }) => ({
      ...variant,
      optionValues: Object.fromEntries(
        input.options.flatMap(({ name }, index) => {
          const value = variant.optionValues[index];
          return value ? [[name, value]] : [];
        }),
      ),
    })),
  }))
  .superRefine(validateVariants);
export type ProductFormValues = z.input<typeof productFormSchema>;
export type ProductFormInput = z.output<typeof productFormSchema>;

const productReadinessValues = ['needs_price', 'needs_photo', 'hidden', 'running_low'] as const;
export type ProductReadiness = (typeof productReadinessValues)[number];

export const productListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(3).max(200).optional(),
  readiness: z.enum(productReadinessValues).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export const productTabValues = ['overview', 'stock'] as const;
export type ProductTab = (typeof productTabValues)[number];

export const productScreenQuerySchema = productListQuerySchema
  .extend({
    adjust: z.uuid().optional(),
    product: z.uuid().optional(),
    productTab: z.enum(productTabValues).optional(),
    create: z.literal('1').optional(),
  })
  .refine(
    (query) => [query.adjust, query.product, query.create].filter(Boolean).length <= 1,
    'Choose one product action at a time',
  );
export type ProductOption = z.infer<typeof optionSchema>;
export type ProductVariantResponse = z.infer<typeof variantSchema> & {
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
  readiness: ProductReadiness[];
  photos: ProductPhotoResponse[];
  variants: ProductVariantResponse[];
  createdAt: string;
  updatedAt: string;
};
export type ProductListResponse = { items: ProductResponse[]; nextCursor: string | null };

export type ProductCategoriesResponse = { items: string[] };

export type StockMovementKind = (typeof stockMovementKinds)[number];
export const MAX_STOCK_QUANTITY = 2147483647;
export const stockAdjustmentSchema = z.strictObject({
  quantity: z
    .number()
    .int()
    .min(-MAX_STOCK_QUANTITY)
    .max(MAX_STOCK_QUANTITY)
    .refine((value) => value !== 0, 'Use a nonzero quantity'),
  reason: z.string().trim().min(1).max(500),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export const MAX_PRODUCT_PHOTOS = 10;
export const productPhotoUploadSchema = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export const confirmProductPhotoSchema = productPhotoUploadSchema.extend({ fileId: z.uuid() });
export const reorderProductPhotosSchema = z.strictObject({
  fileIds: z
    .array(z.uuid())
    .max(MAX_PRODUCT_PHOTOS)
    .refine((ids) => new Set(ids).size === ids.length, 'Repeated photo'),
});
export type ProductPhotoUploadInput = z.infer<typeof productPhotoUploadSchema>;
export type ConfirmProductPhotoInput = z.infer<typeof confirmProductPhotoSchema>;
export type ReorderProductPhotosInput = z.infer<typeof reorderProductPhotosSchema>;
export type ProductPhotoUploadResponse = { fileId: string; uploadUrl: string };
export type ProductPhotoResponse = { id: string; url: string };
