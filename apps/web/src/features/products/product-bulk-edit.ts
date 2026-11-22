import {
  bulkEditFields,
  type BulkEditField,
  type ProductBulkEditFormInput,
  type ProductBulkEditFormValues,
  type ProductBulkEditRow,
} from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';

import { formatTakaNumber, takaInputFromPoisha } from '@/lib/format-money';

type GridRow = ProductBulkEditFormInput['rows'][number];

// Cost and stock belong to a size, so the grid edits them only for a product with one size.
export function onlyVariant(product: ProductResponse) {
  return product.variants.length === 1 ? product.variants[0] : undefined;
}

// A size with its own price hides the product price, so the grid does not edit it.
export function hasSizePrice(product: ProductResponse) {
  return product.variants.some((variant) => variant.priceOverridePoisha !== null);
}

export function canEditStock(product: ProductResponse) {
  return product.isStockTracked && onlyVariant(product) !== undefined;
}

// What the grid input shows for a stored value: Taka without a trailing ".00".
export function editableValue(field: BulkEditField, value: number | string | null) {
  if (value === null) return '';
  if (field === 'pricePoisha' || field === 'compareAtPricePoisha' || field === 'costPoisha')
    return takaInputFromPoisha(Number(value)).replace(/\.00$/, '');
  return String(value);
}

export function gridDefaults(
  products: ProductResponse[],
  preset: 'hide' | undefined,
  proposed: ProductBulkEditRow[] = [],
): ProductBulkEditFormValues {
  const proposals = new Map(proposed.map((row) => [row.productId, row]));
  return {
    stockReason: '',
    rows: products.map((product) => defaultRow(product, preset, proposals.get(product.id))),
  };
}

function defaultRow(
  product: ProductResponse,
  preset: 'hide' | undefined,
  next: ProductBulkEditRow | undefined,
) {
  const variant = onlyVariant(product);
  return {
    productId: product.id,
    pricePoisha: editableValue('pricePoisha', next?.pricePoisha ?? product.pricePoisha),
    compareAtPricePoisha: editableValue('compareAtPricePoisha', product.compareAtPricePoisha),
    costPoisha: editableValue('costPoisha', variant?.costPoisha ?? null),
    stock: stockCell(product, next?.stock),
    category: product.category ?? '',
    status: preset === 'hide' ? ('hidden' as const) : product.status,
  };
}

function stockCell(product: ProductResponse, proposed: number | undefined) {
  const variant = onlyVariant(product);
  return canEditStock(product) && variant ? String(proposed ?? variant.onHand) : '';
}

// Only values that differ from the product are sent, so an untouched or blank cell never writes.
export function changedRows(parsed: GridRow[], products: ProductResponse[]): ProductBulkEditRow[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return parsed.flatMap((cell) => {
    const product = byId.get(cell.productId);
    return product ? changedRow(cell, product) : [];
  });
}

function changedRow(cell: GridRow, product: ProductResponse): ProductBulkEditRow[] {
  const typed = {
    pricePoisha: hasSizePrice(product) ? undefined : cell.pricePoisha,
    compareAtPricePoisha: cell.compareAtPricePoisha,
    costPoisha: onlyVariant(product) ? cell.costPoisha : undefined,
    stock: canEditStock(product) ? cell.stock : undefined,
    category: cell.category,
    status: cell.status,
  };
  const changes = bulkEditFields.flatMap((field) => {
    const next = typed[field];
    return next !== undefined && next !== currentValue(product, field) ? [[field, next]] : [];
  });
  return changes.length ? [{ productId: product.id, ...Object.fromEntries(changes) }] : [];
}

export function countChangedValues(rows: ProductBulkEditRow[]) {
  return rows.reduce((total, row) => total + Object.keys(row).length - 1, 0);
}

const fieldLabels: Record<BulkEditField, string> = {
  pricePoisha: 'Price',
  compareAtPricePoisha: 'Old price',
  costPoisha: 'Cost',
  stock: 'Stock',
  category: 'Category',
  status: 'Status',
};
const statusLabels = { active: 'Selling', hidden: 'Hidden' } as const;

function show(field: BulkEditField, value: number | string | null) {
  if (value === null || value === '') return '-';
  if (field === 'status') return statusLabels[value as 'active' | 'hidden'];
  if (typeof value === 'number' && field !== 'stock') return formatTakaNumber(value);
  return String(value);
}

export function currentValue(product: ProductResponse, field: BulkEditField) {
  const variant = onlyVariant(product);
  return {
    pricePoisha: product.pricePoisha,
    compareAtPricePoisha: product.compareAtPricePoisha,
    costPoisha: variant?.costPoisha ?? null,
    stock: variant?.onHand ?? null,
    category: product.category,
    status: product.status,
  }[field];
}

export function displayValue(field: BulkEditField, value: number | string | null) {
  return show(field, value);
}

// One line per field, as in the design: "Price: Cotton T-shirt 1,200 → 1,250 · Leather sandal ...".
export function reviewLines(
  rows: ProductBulkEditRow[],
  products: ProductResponse[],
  stockReason: string,
) {
  const byId = new Map(products.map((product) => [product.id, product]));
  return (Object.keys(fieldLabels) as BulkEditField[]).flatMap((field) => {
    const parts = rows.flatMap((row) => {
      const next = row[field];
      const product = byId.get(row.productId);
      if (next === undefined || !product) return [];
      const text = `${product.name} ${show(field, currentValue(product, field))} → ${show(field, next)}`;
      return [field === 'stock' && stockReason ? `${text} (${stockReason})` : text];
    });
    return parts.length ? [`${fieldLabels[field]}: ${parts.join(' · ')}.`] : [];
  });
}
