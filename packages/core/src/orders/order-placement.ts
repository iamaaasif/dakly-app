import type { AuditEntry } from '@dakly/contracts/audit';
import type { StoreAccess } from '@dakly/contracts/team';

import type { OrderWrite } from './orders.repository';

// Staff and the AI share one creation path; the defaults are a staff order.
export type PlacedBy = {
  idempotencyKey: string;
  access: Pick<StoreAccess, 'seeFullPhone'>;
  actor: AuditEntry['actor'];
  source?: OrderWrite['source'];
  createdByType?: OrderWrite['createdByType'];
};
