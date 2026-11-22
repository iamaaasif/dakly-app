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

export const MAX_STOCK_QUANTITY = 2147483647;
const money = z
  .number('Enter an amount')
  .int('Enter a whole amount')
  .min(0, 'The amount cannot be negative')
  .max(Number.MAX_SAFE_INTEGER, 'That amount is too large');
const text = z.string().trim().min(1, 'Enter a value').max(200, 'Use 200 characters or fewer');
const optionSchema = z.strictObject({
  name: text,
  values: z
    .array(text)
    .min(1, 'Add at least one value')
    .max(100, 'Use 100 values or fewer')
    .refine((values) => new Set(values).size === values.length, 'Each value must be different'),
});
const variantSchema = z.strictObject({
  optionValues: z.record(z.string(), text).default({}),
  sku: text.nullable().default(null),
  priceOverridePoisha: money.positive('Enter an amount above zero').nullable().default(null),
  costPoisha: money.nullable().default(null),
  // Null uses the shop's warning level from the stock settings.
  lowStockThreshold: z.number().int().min(0).max(MAX_STOCK_QUANTITY).nullable().default(null),
});

const editVariantSchema = variantSchema.extend({ id: z.uuid().optional() });

export const createProductSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter a product name').max(200, 'Use 200 characters or fewer'),
    description: z
      .string()
      .trim()
      .max(10000, 'Use 10,000 characters or fewer')
      .nullable()
      .default(null),
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
      message: 'Each size or option combination must be different',
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

const takaMessage = 'Enter Taka with at most two decimal places';
export const takaInput = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, takaMessage)
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return Number(BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')));
  })
  .pipe(money);
const optionalTakaInput = z.union([z.literal('').transform(() => null), takaInput], {
  error: takaMessage,
});
const optionalCount = z.union(
  [
    z.literal('').transform(() => null),
    z
      .string()
      .regex(/^\d+$/, 'Enter a whole number')
      .transform(Number)
      .pipe(z.number().int().max(MAX_STOCK_QUANTITY, 'That number is too large')),
  ],
  { error: 'Enter a whole number' },
);
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
    pricePoisha: z
      .union([z.literal('').transform(() => 0), takaInput], { error: takaMessage })
      .default(0),
    compareAtPricePoisha: optionalTakaInput.default(null),
    variants: z
      .array(
        z.strictObject({
          ...editVariantSchema.shape,
          sku: optionalTextInput.pipe(editVariantSchema.shape.sku.unwrap()).default(null),
          priceOverridePoisha: optionalTakaInput
            .pipe(money.positive('Enter an amount above zero').nullable())
            .default(null),
          costPoisha: optionalTakaInput.default(null),
          lowStockThreshold: optionalCount.default(null),
          initialStock: z
            .number('Enter a stock number')
            .int('Enter a whole number')
            .min(0, 'Stock cannot be negative')
            .default(0),
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

const productReadinessValues = [
  'needs_price',
  'needs_photo',
  'hidden',
  'running_low',
  'out_of_stock',
] as const;
export type ProductReadiness = (typeof productReadinessValues)[number];

export const productListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(3).max(200).optional(),
  readiness: z.enum(productReadinessValues).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productScreenQuerySchema = productListQuerySchema
  .extend({
    adjust: z.uuid().optional(),
    import: z.literal('1').optional(),
  })
  .refine(
    (query) => [query.adjust, query.import].filter(Boolean).length <= 1,
    'Choose one product action at a time',
  );
export type ProductOption = z.infer<typeof optionSchema>;
export type ProductVariantResponse = z.infer<typeof variantSchema> & {
  id: string;
  title: string;
  isDefault: boolean;
  imageFileIds: string[];
  photos: ProductPhotoResponse[];
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
export const stockAdjustmentSchema = z.strictObject({
  quantity: z
    .number('Enter how many to add or remove')
    .int('Enter a whole number')
    .min(-MAX_STOCK_QUANTITY, 'That is too many to remove at once')
    .max(MAX_STOCK_QUANTITY, 'That is too many to add at once')
    .refine((value) => value !== 0, 'Enter a number other than zero'),
  reason: z.string().trim().min(1, 'Enter a reason').max(500, 'Use 500 characters or fewer'),
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

// What the model says about one product photo. Tags hold the colour and the look in English and
// Bangla, so "লাল" finds the red photo as well as "red".
export const productPhotoTagsSchema = z.strictObject({
  description: z.string().max(400),
  tags: z.array(z.string().min(1).max(40)).max(12),
});
export type ProductPhotoTags = z.infer<typeof productPhotoTagsSchema>;

// A name is enough on a new product; a saved product can also have its photos read.
export const suggestProductOptionsSchema = z
  .strictObject({
    name: z.string().trim().max(200).default(''),
    productId: z.uuid().optional(),
  })
  .refine((input) => input.name || input.productId, 'Enter a product name or add a photo first');
export type SuggestProductOptionsInput = z.infer<typeof suggestProductOptionsSchema>;
export const suggestedOptionsOutputSchema = z.strictObject({
  options: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(40),
        values: z.array(z.string().trim().min(1).max(40)).max(12),
      }),
    )
    .max(3),
});
export type SuggestedOptionsResponse = z.infer<typeof suggestedOptionsOutputSchema>;
