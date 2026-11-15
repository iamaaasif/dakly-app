import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { stores } from './stores';
import { staffAuditLog } from './admin';
// Membership at recovery time determines which shops may read the canonical audit event.
export const staffRecoveryHistory = pgTable(
  'staff_recovery_history',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => staffAuditLog.id),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.auditId] }),
    index('staff_recovery_history_audit_id_idx').on(table.auditId),
  ],
);
