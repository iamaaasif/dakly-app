export type ImportVariant = {
  rowNumber: number;
  sku: string | null;
  optionValues: Record<string, string>;
  priceOverridePoisha: number | null;
  costPoisha: number | null;
  onHand: number | undefined;
};

export type ImportProduct = {
  name: string;
  category: string | null;
  description: string | null;
  status: 'active' | 'hidden' | undefined;
  pricePoisha: number;
  options: { name: string; values: string[] }[];
  variants: ImportVariant[];
};
