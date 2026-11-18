import type { ProductReadiness } from '@dakly/contracts/products';

export const readinessLabels: Record<ProductReadiness, string> = {
  needs_price: 'Needs a price',
  needs_photo: 'Needs a photo',
  hidden: 'Hidden',
  running_low: 'Running low',
};
