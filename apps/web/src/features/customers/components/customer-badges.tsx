import type { ContactResponse } from '@dakly/contracts/contacts';
import { Badge } from '@dakly/ui/badge';

import { customerKindLabels } from '../customer-labels';

type CustomerBadgesProps = { customer: Pick<ContactResponse, 'kind' | 'tags'> };

export function CustomerBadges({ customer }: CustomerBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <Badge variant={customer.kind === 'customer' ? 'neutral' : 'info'}>
        {customerKindLabels[customer.kind]}
      </Badge>
      {customer.tags.map((tag) => (
        <Badge key={tag} variant="info">
          {tag}
        </Badge>
      ))}
    </div>
  );
}
