import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

// One statement per table, in an order that never leaves a dangling reference. The app role may
// not delete consents or tracked link visits; they go through the contact's cascading foreign keys,
// which run with the table owner's rights.
@Injectable()
export class ContactErasureRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Returns the ids of the chats it deleted, so their archived messages can be removed too.
  erase(
    storeId: string,
    contactId: string,
  ): Promise<{ found: boolean; conversationIds: string[] }> {
    return this.database.forStore(storeId, async (tx) => {
      const exists = await tx.execute(
        sql`select 1 from contacts where store_id = ${storeId} and id = ${contactId} for update`,
      );
      if (exists.rows.length === 0) return { found: false, conversationIds: [] };

      const chats = await tx.execute(
        sql`select id from conversations where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      const conversationIds = chats.rows.map((row) => String(row.id));
      const chatList = sql`(select id from conversations where store_id = ${storeId} and contact_id = ${contactId})`;

      // Orders are kept; attribution names the person's taps and reads, so it goes (ANA-2).
      await tx.execute(sql`
        update orders set buyer_contact_id = null, conversation_id = null,
          attributed_source_type = null, attributed_source_id = null, attributed_channel = null,
          attributed_touch_id = null, attributed_touch_at = null, attributed_amount_poisha = null,
          attributed_window_days = null
        where store_id = ${storeId}
          and (buyer_contact_id = ${contactId} or conversation_id in ${chatList})`);
      await tx.execute(
        sql`update discount_codes set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      await tx.execute(
        sql`update data_requests set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      await tx.execute(
        sql`update khata_rows set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      await tx.execute(
        sql`update khata_rows set matched_contact_id = null where store_id = ${storeId} and matched_contact_id = ${contactId}`,
      );
      await tx.execute(
        sql`update sms_messages set contact_id = null where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      // The operation key stays so an old retry cannot merge again; the images and ids go.
      await tx.execute(sql`
        update contact_merges set moved_rows = '[]'::jsonb, replaced_fields = '{}'::jsonb,
          after_state = '{}'::jsonb, undo_conflicts = '[]'::jsonb,
          evidence_redacted_at = coalesce(evidence_redacted_at, now()),
          kept_contact_id = case when kept_contact_id = ${contactId} then null else kept_contact_id end,
          merged_contact_id = case when merged_contact_id = ${contactId} then null else merged_contact_id end
        where store_id = ${storeId}
          and (kept_contact_id = ${contactId} or merged_contact_id = ${contactId})`);

      await tx.execute(
        sql`delete from tasks where store_id = ${storeId} and (contact_id = ${contactId} or conversation_id in ${chatList})`,
      );
      await tx.execute(
        sql`delete from social_comments where store_id = ${storeId} and (contact_id = ${contactId} or conversation_id in ${chatList})`,
      );
      await tx.execute(
        sql`delete from messages where store_id = ${storeId} and conversation_id in ${chatList}`,
      );
      await tx.execute(
        sql`delete from conversations where store_id = ${storeId} and contact_id = ${contactId}`,
      );
      // Memories, identities, consents, stats, suggestions, recipients, links, runs, tasks and
      // baki entries follow through their cascading keys.
      await tx.execute(sql`delete from contacts where store_id = ${storeId} and id = ${contactId}`);
      return { found: true, conversationIds };
    });
  }
}
