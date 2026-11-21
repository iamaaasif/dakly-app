import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { messageAttachmentsSchema, type MessageAttachment } from '@dakly/contracts/chats';
import { conversations, messages } from '@dakly/db/schema/chats';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class InboundAttachmentsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async find(storeId: string, messageId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          attachments: messages.attachments,
          body: messages.body,
          connectionId: conversations.channelConnectionId,
          channel: conversations.channel,
        })
        .from(messages)
        .innerJoin(
          conversations,
          and(
            eq(conversations.storeId, messages.storeId),
            eq(conversations.id, messages.conversationId),
          ),
        )
        .where(
          and(
            eq(messages.storeId, storeId),
            eq(messages.id, messageId),
            eq(messages.direction, 'in'),
          ),
        ),
    );
    if (!row) return undefined;
    return { ...row, attachments: messageAttachmentsSchema.parse(row.attachments ?? []) };
  }

  // The row lock makes two workers copying the same message settle each attachment once.
  settle(storeId: string, messageId: string, index: number, outcome: MessageAttachment) {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ attachments: messages.attachments })
        .from(messages)
        .where(and(eq(messages.storeId, storeId), eq(messages.id, messageId)))
        .for('update');
      const attachments = messageAttachmentsSchema.parse(row?.attachments ?? []);
      if (attachments[index]?.status !== 'pending') return false;
      attachments[index] = outcome;
      await tx
        .update(messages)
        .set({ attachments })
        .where(and(eq(messages.storeId, storeId), eq(messages.id, messageId)));
      return true;
    });
  }

  // A retry that finds the attachment already read adds nothing, so the text is never doubled.
  saveReading(
    storeId: string,
    messageId: string,
    index: number,
    outcome: { read: 'done'; text: string | undefined } | { read: 'failed' },
  ) {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ attachments: messages.attachments, mediaText: messages.mediaText })
        .from(messages)
        .where(and(eq(messages.storeId, storeId), eq(messages.id, messageId)))
        .for('update');
      const attachments = messageAttachmentsSchema.parse(row?.attachments ?? []);
      const attachment = attachments[index];
      if (attachment?.status !== 'stored' || attachment.read) return false;
      attachments[index] = { ...attachment, read: outcome.read };
      const text = outcome.read === 'done' ? outcome.text : undefined;
      await tx
        .update(messages)
        .set({
          attachments,
          mediaText: text ? [row?.mediaText, text].filter(Boolean).join('\n') : row?.mediaText,
        })
        .where(and(eq(messages.storeId, storeId), eq(messages.id, messageId)));
      return true;
    });
  }
}
