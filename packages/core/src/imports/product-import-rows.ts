import {
  type ProductImportMapping,
  type ProductImportRow,
  productImportRowSchema,
} from '@dakly/contracts/product-imports';

import { readCsvLines } from './csv-records';
import { importError } from './imports.errors';

const MAX_VARIANTS = 100;

// Row numbers are the ones the spreadsheet shows: the header is row 1.
export type ProductImportRowError = { rowNumber: number; field: string; message: string };

export type ProductImportVariant = {
  rowNumber: number;
  sku: string | null;
  optionValues: Record<string, string>;
  priceOverridePoisha: number | null;
  costPoisha: number | null;
  onHand: number | undefined;
};

export type ProductImportProduct = {
  name: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  // Blank means the file did not say, so a new product is shown and an existing one is left as is.
  status: 'active' | 'hidden' | undefined;
  pricePoisha: number;
  options: { name: string; values: string[] }[];
  variants: ProductImportVariant[];
};

export type ProductImportRows = {
  products: ProductImportProduct[];
  errors: ProductImportRowError[];
};

type Parsed = { rowNumber: number; row: ProductImportRow; optionValues: Record<string, string> };

// One row is one variant. Rows with the same product name form one product, and the first valid
// row sets the product's own fields.
export function readProductImportRows(
  file: string,
  mapping: ProductImportMapping,
): ProductImportRows {
  const { header, lines } = readCsvLines(file);
  if (lines.length === 0) throw importError('IMPORT_FILE_EMPTY');
  const { options, ...fields } = mapping;
  const columns = [...Object.values(fields), ...options.map(({ column }) => column)];
  if (columns.some((column) => column !== undefined && column >= header.length))
    throw importError('IMPORT_COLUMN_MISSING');

  const errors: ProductImportRowError[] = [];
  const groups = new Map<string, Parsed[]>();
  for (const { rowNumber, cells } of lines) {
    const parsed = parseRow(cells, mapping);
    if (Array.isArray(parsed)) {
      errors.push(...parsed.map((issue) => ({ rowNumber, ...issue })));
      continue;
    }
    const key = parsed.row.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), { rowNumber, ...parsed }]);
  }
  const seenSkus = new Set<string>();
  const products = [...groups.values()]
    .map((rows) => buildProduct(rows, mapping, { seenSkus, errors }))
    .filter((product) => product.variants.length > 0);
  return { products, errors: errors.sort((a, b) => a.rowNumber - b.rowNumber) };
}

function parseRow(cells: string[], mapping: ProductImportMapping) {
  const cell = (column: number | undefined) => (column === undefined ? '' : (cells[column] ?? ''));
  const parsed = productImportRowSchema.safeParse({
    name: cell(mapping.name),
    price: cell(mapping.price).trim(),
    category: cell(mapping.category),
    brand: cell(mapping.brand),
    description: cell(mapping.description),
    status: cell(mapping.status),
    sku: cell(mapping.sku),
    cost: cell(mapping.cost).trim(),
    onHand: cell(mapping.onHand).trim(),
  });
  if (!parsed.success)
    return parsed.error.issues.map((issue) => ({
      field: String(issue.path[0]),
      message: issue.message,
    }));
  const optionValues: Record<string, string> = {};
  for (const option of mapping.options) {
    const value = cell(option.column).trim();
    if (value) optionValues[option.name] = value;
  }
  // A product with no options leaves every option cell blank, as an exported catalogue does.
  const missing = mapping.options.find(
    ({ name }) => !optionValues[name] && Object.keys(optionValues).length > 0,
  );
  return missing
    ? [{ field: missing.name, message: `${missing.name} is empty` }]
    : { row: parsed.data, optionValues };
}

function buildProduct(
  rows: Parsed[],
  mapping: ProductImportMapping,
  { seenSkus, errors }: { seenSkus: Set<string>; errors: ProductImportRowError[] },
): ProductImportProduct {
  const first = rows[0]!.row;
  const optionNames = Object.keys(rows[0]!.optionValues);
  const variants: ProductImportVariant[] = [];
  const seenCombinations = new Set<string>();
  let brand: string | null = null;
  for (const { rowNumber, row, optionValues } of rows) {
    const problem =
      optionSetProblem(optionValues, optionNames) ??
      variantProblem(row, optionValues, {
        first,
        optionNames,
        variants: variants.length,
        seenSkus,
        seenCombinations,
      });
    if (problem) {
      errors.push({ rowNumber, ...problem });
      continue;
    }
    if (variants.length === 0) brand = row.brand;
    if (row.sku) seenSkus.add(row.sku);
    // A later price that differs from the product's is that size's own price.
    const differs = row.price > 0 && row.price !== first.price;
    variants.push({
      rowNumber,
      sku: row.sku,
      optionValues,
      priceOverridePoisha: variants.length > 0 && differs ? row.price : null,
      costPoisha: row.cost,
      onHand: row.onHand,
    });
  }
  return {
    name: first.name,
    category: first.category,
    brand,
    description: first.description,
    status: first.status,
    pricePoisha: first.price,
    options: optionNames.map((name) => ({
      name,
      values: [...new Set(variants.map((variant) => variant.optionValues[name]!))],
    })),
    variants,
  };
}

function optionSetProblem(optionValues: Record<string, string>, optionNames: string[]) {
  return Object.keys(optionValues).length === optionNames.length
    ? undefined
    : { field: 'options', message: 'Rows of one product need the same options' };
}

function variantProblem(
  row: ProductImportRow,
  optionValues: Record<string, string>,
  context: {
    first: ProductImportRow;
    optionNames: string[];
    variants: number;
    seenSkus: Set<string>;
    seenCombinations: Set<string>;
  },
): { field: string; message: string } | undefined {
  const { first, optionNames, variants, seenSkus, seenCombinations } = context;
  const hasOptions = optionNames.length > 0;
  const changed = (['category', 'description', 'status'] as const).find(
    (field) => row[field] && row[field] !== first[field],
  );
  if (changed) return { field: changed, message: 'Differs from the first row of this product' };
  if (variants === MAX_VARIANTS || (variants > 0 && !hasOptions))
    return {
      field: 'name',
      message: hasOptions
        ? 'A product has at most 100 variants'
        : 'A product without options has one row',
    };
  if (row.sku && seenSkus.has(row.sku))
    return { field: 'sku', message: 'An earlier row has this SKU' };
  const combination = JSON.stringify(
    Object.entries(optionValues).map(([k, v]) => [k, v.toLowerCase()]),
  );
  if (hasOptions && seenCombinations.has(combination))
    return { field: 'options', message: 'An earlier row has these options' };
  seenCombinations.add(combination);
  return undefined;
}
