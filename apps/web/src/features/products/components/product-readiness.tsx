import type { ProductResponse } from '@dakly/contracts/products';
import { Badge } from '@dakly/ui/badge';

import { readinessLabels } from '../product-labels';

type ProductReadinessProps = {
  product: Pick<ProductResponse, 'readiness'>;
};

function readinessBadgeVariant(label: ProductResponse['readiness'][number]) {
  if (label === 'needs_price') return 'danger';
  if (label === 'hidden') return 'neutral';
  return 'warning';
}

export function ProductReadiness({ product }: ProductReadinessProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {product.readiness.length ? (
        product.readiness.map((label) => (
          <Badge
            key={label}
            variant={readinessBadgeVariant(label)}
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            {readinessLabels[label]}
          </Badge>
        ))
      ) : (
        <Badge variant="success" className="rounded-full px-2.5 py-0.5 text-xs font-medium">
          Ready
        </Badge>
      )}
    </div>
  );
}
