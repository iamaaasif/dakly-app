import type { ProductReadiness } from '@dakly/contracts/products';

export const readinessLabels: Record<ProductReadiness, string> = {
  needs_price: 'Needs a price',
  needs_photo: 'Needs a photo',
  hidden: 'Draft',
  running_low: 'Running low',
  out_of_stock: 'Out of stock',
};
