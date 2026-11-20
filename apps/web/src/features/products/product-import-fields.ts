import type { ProductImportMapping } from '@dakly/contracts/product-imports';

type FieldName = Exclude<keyof ProductImportMapping, 'options'>;

export const productImportFields: {
  field: FieldName;
  label: string;
  names: string[];
  required?: true;
}[] = [
  {
    field: 'name',
    label: 'Product name',
    names: ['name', 'productname', 'product', 'title'],
    required: true,
  },
  {
    field: 'price',
    label: 'Price (taka)',
    names: ['price', 'sellingprice', 'saleprice'],
    required: true,
  },
  { field: 'category', label: 'Category', names: ['category'] },
  { field: 'description', label: 'Description', names: ['description', 'details'] },
  { field: 'status', label: 'Status', names: ['status', 'visibility'] },
  { field: 'sku', label: 'SKU', names: ['sku', 'code', 'productcode'] },
  { field: 'cost', label: 'Cost (taka)', names: ['cost', 'costprice', 'buyingprice'] },
  { field: 'onHand', label: 'On hand', names: ['onhand', 'stock', 'quantity', 'qty'] },
];

const optionNames = ['size', 'color', 'colour'];

const plain = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// Matches column names such as "Selling Price" so the owner only fixes what is wrong. Columns
// named Size or Colour become option columns, because most shops sell those.
export function guessProductImportMapping(header: string[]): Partial<ProductImportMapping> {
  const columns = header.map(plain);
  const mapping: Partial<ProductImportMapping> = {};
  for (const { field, names } of productImportFields) {
    const column = columns.findIndex(
      (name, index) => names.includes(name) && !Object.values(mapping).includes(index),
    );
    if (column !== -1) mapping[field] = column;
  }
  mapping.options = columns.flatMap((name, column) =>
    optionNames.includes(name) ? [{ name: header[column]!.trim(), column }] : [],
  );
  return mapping;
}
