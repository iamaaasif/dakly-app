import type { ProductResponse } from '@dakly/contracts/products';
import { Badge } from '@dakly/ui/badge';

type ProductReadinessProps = {
  product: Pick<ProductResponse, 'readiness'> & Partial<Pick<ProductResponse, 'status'>>;
};

function getProductStatus(product: ProductReadinessProps['product']): {
  label: string;
  variant: 'danger' | 'warning' | 'neutral' | 'success';
} {
  if (product.readiness.includes('needs_price')) {
    return { label: 'Needs a price', variant: 'danger' };
  }
  if (product.status === 'hidden' || product.readiness.includes('hidden')) {
    return { label: 'Hidden', variant: 'neutral' };
  }
  if (product.readiness.includes('running_low')) {
    return { label: 'Running low', variant: 'warning' };
  }
  return { label: 'Selling', variant: 'success' };
}

export function ProductReadiness({ product }: ProductReadinessProps) {
  const { label, variant } = getProductStatus(product);
  return (
    <Badge variant={variant} className="rounded-full px-2.5 py-0.5 text-xs font-medium">
      {label}
    </Badge>
  );
}
