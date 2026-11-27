import { useEffect, useState } from 'react';

export const productColumns = ['price', 'stock', 'status'] as const;
export type ProductColumn = (typeof productColumns)[number];
export const productColumnLabels: Record<ProductColumn, string> = {
  price: 'Price',
  stock: 'Stock',
  status: 'Status',
};

const storageKey = 'dakly.products.columns';

function readColumns(): ProductColumn[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
    if (!Array.isArray(saved)) return [...productColumns];
    return productColumns.filter((column) => saved.includes(column));
  } catch {
    return [...productColumns];
  }
}

// The choice is a personal view setting, so it stays in this browser.
export function useProductColumns() {
  const [columns, setColumns] = useState<ProductColumn[]>([...productColumns]);
  useEffect(() => setColumns(readColumns()), []);
  const toggle = (column: ProductColumn, on: boolean) => {
    const next = productColumns.filter((each) => (each === column ? on : columns.includes(each)));
    setColumns(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The view still changes for this visit.
    }
  };
  return { columns, toggle };
}
