import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, foreignKey, index } from 'drizzle-orm/pg-core';

import { campaignSourceOutcomes } from '@dakly/contracts/campaigns';

import { isOneOf } from './columns';

// The send job reads scheduled campaigns when they are due and the ones with sends left to make.
export const sendingIndexes = (
  table: Record<
    'storeId' | 'id' | 'status' | 'scheduledFor' | 'startedAt' | 'settlementPendingAt',
    AnyPgColumn
  >,
) => [
  index('campaigns_due_idx')
    .on(table.scheduledFor)
    .where(sql`${table.status} = 'scheduled'`),
  index('campaigns_start_due_by_store_idx')
    .on(table.storeId, table.scheduledFor, table.id)
    .where(sql`${table.status} = 'scheduled'`),
  index('campaigns_send_work_idx')
    .on(table.storeId, table.startedAt, table.id)
    .where(
      sql`${table.status} = 'sending' or (${table.status} = 'cancelled' and ${table.settlementPendingAt} is not null)`,
    ),
];

// A resend or follow-up draft points at the finished campaign its audience comes from.
export const sourceConstraints = (
  table: Record<'id' | 'storeId' | 'sourceCampaignId' | 'sourceOutcome', AnyPgColumn>,
) => [
  foreignKey({
    name: 'campaigns_source_campaign_id_store_fk',
    columns: [table.storeId, table.sourceCampaignId],
    foreignColumns: [table.storeId, table.id],
  }),
  check(
    'campaigns_source',
    sql`(${table.sourceCampaignId} is null) = (${table.sourceOutcome} is null)`,
  ),
  check('campaigns_source_outcome', isOneOf(table.sourceOutcome, campaignSourceOutcomes)),
  index('campaigns_source_campaign_id_idx').on(table.sourceCampaignId),
];
