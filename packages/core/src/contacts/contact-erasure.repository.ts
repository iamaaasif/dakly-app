import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

// One statement per table, in an order that never leaves a dangling reference. The app role may
// not delete consents or tracked link visits; they go through the contact's cascading foreign keys,
// which run with the table owner's rights.
// Orders are kept; attribution names the person's taps and reads, so it goes (ANA-2). The merge
// operation key stays so an old retry cannot merge again; its images and ids go. Memories,
// identities, consents, stats, suggestions, recipients, links, runs and baki entries follow
// through the contact's cascading keys, which the last statement fires.
function dependentStatements(storeId: string, contactId: string, chatList: SQL) {
  return [
    sql`
        update orders set buyer_contact_id = null, conversation_id = null,
          attributed_source_type = null, attributed_source_id = null, attributed_channel = null,
          attributed_touch_id = null, attributed_touch_at = null, attributed_amount_poisha = null,
          attributed_window_days = null
        where store_id = ${storeId}
          and (buyer_contact_id = ${contactId} or conversation_id in ${chatList})`,
    sql`update discount_codes set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
    sql`update data_requests set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
    sql`update khata_rows set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
    sql`update khata_rows set matched_contact_id = null where store_id = ${storeId} and matched_contact_id = ${contactId}`,
    sql`update sms_messages set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
    sql`
        update contact_merges set moved_rows = '[]'::jsonb, replaced_fields = '{}'::jsonb,
          after_state = '{}'::jsonb, undo_conflicts = '[]'::jsonb,
          evidence_redacted_at = coalesce(evidence_redacted_at, now()),
          kept_contact_id = case when kept_contact_id = ${contactId} then null else kept_contact_id end,
          merged_contact_id = case when merged_contact_id = ${contactId} then null else merged_contact_id end
        where store_id = ${storeId}
          and (kept_contact_id = ${contactId} or merged_contact_id = ${contactId})`,
    sql`delete from tasks where store_id = ${storeId} and (contact_id = ${contactId} or conversation_id in ${chatList})`,
    sql`delete from social_comments where store_id = ${storeId} and (contact_id = ${contactId} or conversation_id in ${chatList})`,
    sql`delete from messages where store_id = ${storeId} and conversation_id in ${chatList}`,
    sql`delete from conversations where store_id = ${storeId} and contact_id = ${contactId}`,
    sql`delete from contacts where store_id = ${storeId} and id = ${contactId}`,
  ];
}

@Injectable()
export class ContactErasureRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  async dueDeleted(limit: number): Promise<{ storeId: string; contactId: string }[]> {
    const { rows } = await this.global.execute<{ store_id: string; contact_id: string }>(
      sql`select store_id, contact_id from due_contact_purges(${limit})`,
    );
    return rows.map((row) => ({ storeId: row.store_id, contactId: row.contact_id }));
  }

  // Returns the chat ids and attachment keys it deleted, so the stored files go after the commit.
  erase(
    storeId: string,
    contactId: string,
  ): Promise<{ found: boolean; conversationIds: string[]; attachmentKeys: string[] }> {
    return this.database.forStore(storeId, async (tx) => {
      const exists = await tx.execute(
        sql`select 1 from contacts where store_id = ${storeId} and id = ${contactId} for update`,
      );
      if (exists.rows.length === 0)
        return { found: false, conversationIds: [], attachmentKeys: [] };

      const chats = await tx.execute(
        sql`select id from conversations where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      const conversationIds = chats.rows.map((row) => String(row.id));
      const chatList = sql`(select id from conversations where store_id = ${storeId} and contact_id = ${contactId})`;

      const files = await tx.execute(sql`
        select distinct attachment ->> 'objectKey' as key
        from messages, jsonb_array_elements(coalesce(attachments, '[]'::jsonb)) as attachment
        where store_id = ${storeId} and conversation_id in ${chatList}
          and attachment ->> 'objectKey' is not null`);
      const attachmentKeys = files.rows.map((row) => String(row.key));

      for (const statement of dependentStatements(storeId, contactId, chatList)) {
        await tx.execute(statement);
      }
      return { found: true, conversationIds, attachmentKeys };
    });
  }
}
