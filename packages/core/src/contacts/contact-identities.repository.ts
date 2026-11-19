import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { contactIdentities, contacts } from '@dakly/db/schema/contacts';

import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

export type InboundIdentity = {
  connectionId: string;
  externalId: string;
  channel: typeof contactIdentities.$inferInsert.channel;
};

@Injectable()
export class ContactIdentitiesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findInboundIdentity(storeId: string, { connectionId, externalId }: InboundIdentity) {
    const [identity] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: contactIdentities.id,
          contactId: contactIdentities.contactId,
          deletedAt: contacts.deletedAt,
        })
        .from(contactIdentities)
        .innerJoin(
          contacts,
          and(
            eq(contacts.storeId, contactIdentities.storeId),
            eq(contacts.id, contactIdentities.contactId),
          ),
        )
        .where(
          and(
            eq(contactIdentities.storeId, storeId),
            eq(contactIdentities.channelConnectionId, connectionId),
            eq(contactIdentities.externalId, externalId),
          ),
        )
        .for('no key update', { of: contacts }),
    );
    return identity;
  }

  async retireInboundIdentity(storeId: string, id: string) {
    // Campaign history keeps its identity reference until the contact is purged.
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(contactIdentities)
        .set({ externalId: `deleted:${id}`, profileName: null })
        .where(and(eq(contactIdentities.storeId, storeId), eq(contactIdentities.id, id))),
    );
  }

  createInboundIdentity(storeId: string, input: InboundIdentity, now: Date) {
    return this.database.forStore(storeId, async (tx) => {
      const contactId = newId();
      await tx.insert(contacts).values({
        id: contactId,
        storeId,
        source: input.channel,
        kind: 'chat_only',
        createdAt: now,
        updatedAt: now,
      });
      const [identity] = await tx
        .insert(contactIdentities)
        .values({
          storeId,
          contactId,
          channelConnectionId: input.connectionId,
          channel: input.channel,
          externalId: input.externalId,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [contactIdentities.channelConnectionId, contactIdentities.externalId],
        })
        .returning({ contactId: contactIdentities.contactId });
      // The store never sees the transient contact if another webhook claimed the identity.
      if (!identity)
        await tx
          .delete(contacts)
          .where(and(eq(contacts.storeId, storeId), eq(contacts.id, contactId)));
      return identity;
    });
  }
}
