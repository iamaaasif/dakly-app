import { z } from 'zod';

import { importDuplicateModes, MAX_IMPORT_COLUMNS } from './contacts';
import { MAX_STOCK_QUANTITY, productListQuerySchema, takaInput } from './products';

const column = z
  .int()
  .min(0)
  .max(MAX_IMPORT_COLUMNS - 1);
const text = z.string().trim().min(1).max(200);

// Option names come from the mapping, so a file can call its size column anything.
export const productImportMappingSchema = z
  .strictObject({
    name: column,
    price: column,
    category: column.optional(),
    description: column.optional(),
    status: column.optional(),
    sku: column.optional(),
    cost: column.optional(),
    onHand: column.optional(),
    options: z
      .array(z.strictObject({ name: text, column }))
      .max(3)
      .default([]),
  })
  .refine(
    ({ options }) => new Set(options.map(({ name }) => name.toLowerCase())).size === options.length,
    { path: ['options'], message: 'Option names must differ' },
  );

export const startProductImportSchema = z.strictObject({
  mapping: productImportMappingSchema,
  duplicateMode: z.enum(importDuplicateModes),
});

const blankAsNull = (value: string) => value.trim() || null;
// A blank cell is no value, so it skips the schema that would otherwise reject it.
const optionalCell = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

// A blank price means the product still needs one, as in the product form.
export const productImportRowSchema = z.object({
  name: text,
  price: optionalCell(takaInput).transform((value) => value ?? 0),
  category: z.string().transform(blankAsNull).pipe(text.nullable()),
  description: z.string().transform(blankAsNull).pipe(z.string().max(10000).nullable()),
  status: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value),
    z.enum(['active', 'hidden'], 'Use active or hidden').optional(),
  ),
  sku: z.string().transform(blankAsNull).pipe(text.nullable()),
  cost: optionalCell(takaInput).transform((value) => value ?? null),
  onHand: optionalCell(
    z
      .string()
      .regex(/^\d+$/, 'Enter a whole number')
      .transform(Number)
      .pipe(z.int().max(MAX_STOCK_QUANTITY)),
  ),
});

export type ProductImportMapping = z.infer<typeof productImportMappingSchema>;
export type ProductImportRow = z.infer<typeof productImportRowSchema>;
export type StartProductImportInput = z.infer<typeof startProductImportSchema>;
// What a form holds before the schema fills in the default of no option columns.
export type StartProductImportForm = z.input<typeof startProductImportSchema>;

export const productExportFormats = ['csv', 'xlsx'] as const;

// The file is made for the filters on the products screen, so the shop gets what it is looking at.
export const productExportQuerySchema = productListQuerySchema
  .pick({ search: true, readiness: true })
  .extend({ format: z.enum(productExportFormats).default('xlsx') });
export type ProductExportQuery = z.infer<typeof productExportQuerySchema>;
