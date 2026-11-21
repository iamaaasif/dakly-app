import { Inject, Injectable } from '@nestjs/common';

import type {
  CommentListQuery,
  CommentReplyInput,
  CommentResponse,
} from '@dakly/contracts/comments';
import { privateReplyWindowDays } from '@dakly/contracts/comments';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { commentError } from './comments.errors';
import { CommentsRepository, type CommentRow } from './comments.repository';

export type ReceiveCommentInput = {
  kind: 'facebook_page' | 'instagram';
  externalAccountId: string;
  externalPostId: string;
  externalCommentId: string;
  parentExternalCommentId: string | null;
  authorExternalId: string;
  authorName: string | null;
  text: string;
  commentedAt: Date;
  receivedAt: Date;
};

type ReceiveOutcome =
  'stored' | 'duplicate' | 'unknown_account' | 'stale_delivery' | 'invalid_timestamp';

function channelOf(kind: CommentRow['kind']) {
  return kind === 'instagram' ? 'instagram' : 'messenger';
}

function canReplyPrivately(row: CommentRow, now: Date) {
  const expiresAt = new Date(row.commentedAt).getTime() + privateReplyWindowDays * DAY_MS;
  return !row.privateRepliedAt && now.getTime() <= expiresAt;
}

function toResponse(row: CommentRow, now: Date): CommentResponse {
  return {
    id: row.id,
    channel: channelOf(row.kind),
    externalPostId: row.externalPostId,
    postCaption: row.postCaption,
    authorName: row.authorName,
    body: row.body,
    classification: row.classification,
    status: row.status,
    isReply: row.parentExternalCommentId !== null,
    publicReplied: row.publicReplyExternalId !== null,
    privateRepliedAt: row.privateRepliedAt?.toISOString() ?? null,
    canReplyPrivately: canReplyPrivately(row, now),
    commentedAt: row.commentedAt,
  };
}

// A failure before Meta answered may have posted anyway, so it is not reported as a refusal.
function providerError(error: unknown) {
  if (error instanceof MetaRequestError && ['rejected', 'auth_error'].includes(error.code))
    return commentError('COMMENT_REJECTED');
  return commentError('COMMENT_UNCONFIRMED');
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(CommentsRepository) private readonly repository: CommentsRepository,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  receive(storeId: string, input: ReceiveCommentInput): Promise<ReceiveOutcome> {
    return this.transaction.run(storeId, async () => {
      const connection = await this.connections.findInbound(storeId, input);
      if (!connection) return 'unknown_account';
      if (
        input.receivedAt < connection.connectedAt ||
        input.commentedAt.getTime() <= connection.connectedAt.getTime() + MINUTE_MS
      )
        return 'stale_delivery';
      if (input.commentedAt.getTime() > input.receivedAt.getTime() + MINUTE_MS)
        return 'invalid_timestamp';
      // The author may have messaged the shop before; if not, no contact is created for a comment.
      const identity = await this.identities.findActiveChannelIdentity(storeId, {
        channel: connection.channel,
        connectionId: connection.id,
        externalId: input.authorExternalId,
      });
      const id = await this.repository.insert(
        storeId,
        {
          channelConnectionId: connection.id,
          externalPostId: input.externalPostId,
          externalCommentId: input.externalCommentId,
          parentExternalCommentId: input.parentExternalCommentId,
          contactId: identity?.contactId,
          authorName: input.authorName,
          body: input.text,
          commentedAt: input.commentedAt,
        },
        this.clock.now(),
      );
      return id ? 'stored' : 'duplicate';
    });
  }

  async list(storeId: string, query: CommentListQuery) {
    await this.requireChats(storeId);
    const rows = await this.repository.list(storeId, query);
    const now = this.clock.now();
    const items = rows.slice(0, query.limit).map((row) => toResponse(row, now));
    const last = items.at(-1);
    return {
      items,
      nextCursor: last && rows.length > query.limit ? `${last.commentedAt}_${last.id}` : null,
    };
  }

  async replyPublicly(storeId: string, userId: string, id: string, input: CommentReplyInput) {
    await this.requireChats(storeId);
    const row = await this.require(storeId, id);
    if (row.publicReplyExternalId) throw commentError('COMMENT_ALREADY_REPLIED');
    const channel = channelOf(row.kind);
    const prepared = await this.connections.prepareMetaSend(
      storeId,
      row.channelConnectionId,
      channel,
    );
    let externalReplyId: string;
    try {
      ({ externalReplyId } = await this.connections.replyToMetaComment(prepared, {
        channel,
        externalCommentId: row.externalCommentId,
        text: input.body,
      }));
    } catch (error) {
      throw providerError(error);
    }
    await this.transaction.run(storeId, async () => {
      await this.repository.markReplied(
        storeId,
        id,
        { publicReplyExternalId: externalReplyId },
        this.clock.now(),
      );
      await this.record(storeId, userId, {
        action: 'comment.replied_publicly',
        id,
        state: 'replied',
      });
    });
    return this.respond(storeId, id);
  }

  async replyPrivately(storeId: string, userId: string, id: string, input: CommentReplyInput) {
    await this.requireChats(storeId);
    const row = await this.require(storeId, id);
    const now = this.clock.now();
    if (row.privateRepliedAt) throw commentError('COMMENT_PRIVATE_REPLY_USED');
    if (!canReplyPrivately(row, now)) throw commentError('COMMENT_PRIVATE_REPLY_EXPIRED');
    const channel = channelOf(row.kind);
    if (row.contactId) {
      const decision = await this.sendPolicy.check(storeId, {
        contactId: row.contactId,
        channel,
        category: 'staff_reply',
        at: now,
      });
      if (decision.action !== 'send') throw commentError('COMMENT_PRIVATE_REPLY_BLOCKED');
    }
    const prepared = await this.connections.prepareMetaSend(
      storeId,
      row.channelConnectionId,
      channel,
    );
    if (!(await this.repository.claimPrivateReply(storeId, id, now)))
      throw commentError('COMMENT_PRIVATE_REPLY_USED');
    try {
      await this.connections.sendMetaPrivateReply(prepared, {
        channel,
        externalCommentId: row.externalCommentId,
        text: input.body,
      });
    } catch (error) {
      // Only a refusal proves nothing was sent; after an outage the reply may have gone out.
      if (error instanceof MetaRequestError && error.code !== 'unavailable')
        await this.repository.releasePrivateReply(storeId, id, this.clock.now());
      throw providerError(error);
    }
    await this.transaction.run(storeId, async () => {
      await this.repository.markReplied(storeId, id, {}, this.clock.now());
      await this.record(storeId, userId, {
        action: 'comment.replied_privately',
        id,
        state: 'replied',
      });
    });
    return this.respond(storeId, id);
  }

  async setHidden(storeId: string, userId: string, id: string, hidden: boolean) {
    await this.requireChats(storeId);
    const row = await this.require(storeId, id);
    if ((row.status === 'hidden') === hidden) return toResponse(row, this.clock.now());
    const channel = channelOf(row.kind);
    const prepared = await this.connections.prepareMetaSend(
      storeId,
      row.channelConnectionId,
      channel,
    );
    try {
      await this.connections.setMetaCommentHidden(prepared, {
        channel,
        externalCommentId: row.externalCommentId,
        hidden,
      });
    } catch (error) {
      throw providerError(error);
    }
    await this.transaction.run(storeId, async () => {
      await this.repository.setHidden(storeId, id, hidden, this.clock.now());
      await this.record(storeId, userId, {
        action: hidden ? 'comment.hidden' : 'comment.unhidden',
        id,
        state: hidden ? 'hidden' : 'visible',
      });
    });
    return this.respond(storeId, id);
  }

  private async respond(storeId: string, id: string) {
    return toResponse(await this.require(storeId, id), this.clock.now());
  }

  private async require(storeId: string, id: string) {
    const row = await this.repository.find(storeId, id);
    if (!row) throw commentError('COMMENT_NOT_FOUND');
    return row;
  }

  private record(
    storeId: string,
    userId: string,
    change: { action: string; id: string; state: string },
  ) {
    return this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action: change.action,
      entityType: 'comment',
      entityId: change.id,
      after: { state: change.state },
    });
  }

  private async requireChats(storeId: string) {
    const { extensions } = await this.stores.settings(storeId);
    if (!extensions.includes('chats')) throw commentError('CHATS_DISABLED');
  }
}
