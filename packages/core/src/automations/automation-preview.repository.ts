import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { ConsentChannel, ConsentSource } from '@dakly/contracts/contacts';

import { TenantDatabase } from '../platform/database/tenant-database';

export type PreviewSelection = {
  type: 'consent.changed' | 'contact.tag_added' | 'contact.birthday';
  channels?: ConsentChannel[];
  sources?: ConsentSource[];
  tag?: string;
};

type PreviewRow = { id: string; contactId: string; occurredAt: string };
export const TRIGGER_PREVIEW_PAGE_SIZE = 100;

@Injectable()
export class AutomationPreviewRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async list(storeId: string, selection: PreviewSelection, after?: PreviewRow) {
    return this.database.forStore(
      storeId,
      async (tx) =>
        (
          await tx.execute<PreviewRow>(sql`
        select id, contact_id as "contactId",
          to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "occurredAt"
        from automation_trigger_preview(
          ${selection.type}, ${sql.param(selection.channels ?? null)}::text[],
          ${sql.param(selection.sources ?? null)}::text[], ${selection.tag ?? null},
          ${after?.occurredAt ?? null}::timestamptz, ${after?.id ?? null}::uuid, ${TRIGGER_PREVIEW_PAGE_SIZE}
        )
        order by occurred_at desc, id desc
      `)
        ).rows,
    );
  }
}
