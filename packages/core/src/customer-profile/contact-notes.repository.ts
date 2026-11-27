import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { users } from '@dakly/db/schema/auth';
import { contactNotes } from '@dakly/db/schema/contact-notes';

import { TenantDatabase } from '../platform/database/tenant-database';

const columns = {
  id: contactNotes.id,
  body: contactNotes.body,
  createdAt: contactNotes.createdAt,
  authorName: users.name,
};

@Injectable()
export class ContactNotesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, contactId: string, limit: number) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(columns)
        .from(contactNotes)
        .leftJoin(users, eq(users.id, contactNotes.authorUserId))
        .where(and(eq(contactNotes.storeId, storeId), eq(contactNotes.contactId, contactId)))
        .orderBy(desc(contactNotes.createdAt), desc(contactNotes.id))
        .limit(limit),
    );
  }

  insert(storeId: string, contactId: string, body: string, authorUserId: string) {
    return this.database.forStore(storeId, async (tx) => {
      const [saved] = await tx
        .insert(contactNotes)
        .values({ storeId, contactId, body, authorUserId })
        .returning({
          id: contactNotes.id,
          body: contactNotes.body,
          createdAt: contactNotes.createdAt,
        });
      const [author] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, authorUserId));
      if (!saved) throw new Error('Note insert returned no row');
      return { ...saved, authorName: author?.name ?? null };
    });
  }
}
