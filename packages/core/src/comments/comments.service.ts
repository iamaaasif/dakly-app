import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { CommentListQuery, CommentReplyInput } from '@dakly/contracts/comments';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';

import { AuditService } from '../audit/audit.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ConsentService } from '../consents/consent.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { MINUTE_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { canReplyPrivately, channelOf, privateReplyClosesAt, toResponse } from './comment-rows';
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

type AutomaticReply = {
  privateBody?: string;
  publicBody: string;
  stillAllowed: () => Promise<boolean>;
};

// Another reply already won, or the private window closed: the comment is settled, not failed.
const automaticReplySkips = [
  'COMMENT_ALREADY_REPLIED',
  'COMMENT_PRIVATE_REPLY_USED',
  'COMMENT_PRIVATE_REPLY_EXPIRED',
  'COMMENT_PRIVATE_REPLY_BLOCKED',
  'CHANNEL_NOT_CONNECTED',
];

function isDefiniteRejection(error: unknown) {
  return error instanceof MetaRequestError && ['rejected', 'auth_error'].includes(error.code);
}

function providerError(error: unknown) {
  return commentError(isDefiniteRejection(error) ? 'COMMENT_REJECTED' : 'COMMENT_UNCONFIRMED');
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(CommentsRepository) private readonly repository: CommentsRepository,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(ConsentService) private readonly consent: ConsentService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxService) private readonly outbox: OutboxService,
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
          authorExternalId: input.authorExternalId,
          authorName: input.authorName,
          body: input.text,
          commentedAt: input.commentedAt,
        },
        this.clock.now(),
      );
      if (!id) return 'duplicate';
      if (!input.parentExternalCommentId) {
        await this.outbox.publish({
          type: 'comment.received',
          storeId,
          occurredAt: input.receivedAt.toISOString(),
          payload: { commentId: id },
        });
      }
      return 'stored';
    });
  }

  // Replies to comments, answered or hidden comments and comments with no words never start one.
  async triggerFacts(storeId: string, id: string) {
    const row = await this.repository.find(storeId, id);
    if (!row?.body || !row.authorExternalId || row.parentExternalCommentId !== null) return;
    if (row.status !== 'new' || row.classification === 'spam') return;
    return {
      commentId: row.id,
      channel: channelOf(row.kind),
      channelConnectionId: row.channelConnectionId,
      externalPostId: row.externalPostId,
      authorExternalId: row.authorExternalId,
      text: row.body,
      classification: row.classification,
    };
  }

  // The automation that answers a comment calls this first; the AI agent then leaves it alone.
  // False means the comment was already answered, so the automation sends nothing.
  async claimForAutomation(storeId: string, id: string): Promise<boolean> {
    await this.requireChats(storeId);
    return this.repository.claimForAutomation(storeId, id, this.clock.now());
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
    await this.sendPublicReply(storeId, { kind: 'user', userId }, id, input.body);
    return this.respond(storeId, id);
  }

  async replyPrivately(storeId: string, userId: string, id: string, input: CommentReplyInput) {
    await this.requireChats(storeId);
    await this.sendPrivateReply(storeId, { kind: 'user', userId }, id, input.body);
    return this.respond(storeId, id);
  }

  async pendingFacebookReply(storeId: string, id: string) {
    const row = await this.repository.find(storeId, id);
    if (
      !row ||
      row.kind !== 'facebook_page' ||
      row.status === 'hidden' ||
      row.parentExternalCommentId !== null ||
      row.publicReplyExternalId !== null ||
      this.clock.now() >= privateReplyClosesAt(row)
    )
      return;
    const phase = await this.automaticReplyPhase(storeId, row);
    if (!phase) return;
    const { channelConnectionId, externalPostId, body } = row;
    return {
      channelConnectionId,
      externalPostId,
      body,
      claimedByAutomation: row.automationClaimedAt !== null,
      privateSent: phase === 'public',
    };
  }

  private async automaticReplyPhase(storeId: string, row: CommentRow) {
    if (row.status === 'new' && !row.privateRepliedAt) return 'private';
    if (row.status === 'replied' && (await this.hasAutomaticPrivateReply(storeId, row.id)))
      return 'public';
  }

  private async hasAutomaticPrivateReply(storeId: string, id: string) {
    const replies = await this.audit.history(storeId, {
      entityType: 'comment',
      entityId: id,
      action: 'comment.replied_privately',
    });
    return replies.some(({ actorType }) => actorType === 'system');
  }

  async replyAutomatically(
    storeId: string,
    id: string,
    { privateBody, publicBody, stillAllowed }: AutomaticReply,
  ) {
    await this.requireChats(storeId);
    const pending = await this.pendingFacebookReply(storeId, id);
    if (!pending || pending.claimedByAutomation || (!pending.privateSent && !privateBody)) return;
    try {
      await this.dispatchAutomatically(storeId, id, pending, {
        privateBody,
        publicBody,
        stillAllowed,
      });
    } catch (error) {
      if (!(error instanceof AppError && automaticReplySkips.includes(error.code))) throw error;
    }
  }

  private async dispatchAutomatically(
    storeId: string,
    id: string,
    pending: { privateSent: boolean },
    { privateBody, publicBody, stillAllowed }: AutomaticReply,
  ) {
    const actor = { kind: 'system' } as const;
    // The caller's switches are read again right before each send, not trusted from when the job started.
    if (!pending.privateSent && privateBody) {
      if (!(await stillAllowed())) return;
      await this.sendPrivateReply(storeId, actor, id, privateBody);
    }
    if (!(await stillAllowed())) return;
    await this.sendPublicReply(storeId, actor, id, publicBody);
  }

  private async sendPublicReply(
    storeId: string,
    actor: AuditEntry['actor'],
    id: string,
    body: string,
  ) {
    const row = await this.require(storeId, id);
    if (row.publicReplyExternalId) throw commentError('COMMENT_ALREADY_REPLIED');
    const channel = channelOf(row.kind);
    const prepared = await this.connections.prepareMetaSend(
      storeId,
      row.channelConnectionId,
      channel,
    );
    if (
      !(await this.repository.claimPublicReply(
        storeId,
        id,
        this.clock.now(),
        actor.kind === 'system',
      ))
    )
      throw commentError('COMMENT_ALREADY_REPLIED');
    let externalReplyId: string;
    try {
      ({ externalReplyId } = await this.connections.replyToMetaComment(prepared, {
        channel,
        externalCommentId: row.externalCommentId,
        text: body,
      }));
    } catch (error) {
      // Only a refusal proves nothing was posted; after an outage the reply may be on the page.
      if (isDefiniteRejection(error))
        await this.repository.releasePublicReply(storeId, id, this.clock.now());
      throw providerError(error);
    }
    await this.transaction.run(storeId, async () => {
      await this.repository.markReplied(
        storeId,
        id,
        { publicReplyExternalId: externalReplyId },
        this.clock.now(),
      );
      await this.record(storeId, actor, {
        action: 'comment.replied_publicly',
        id,
        state: 'replied',
      });
    });
  }

  private async sendPrivateReply(
    storeId: string,
    actor: AuditEntry['actor'],
    id: string,
    body: string,
  ) {
    const row = await this.require(storeId, id);
    const now = this.clock.now();
    if (row.privateRepliedAt) throw commentError('COMMENT_PRIVATE_REPLY_USED');
    if (!canReplyPrivately(row, now)) throw commentError('COMMENT_PRIVATE_REPLY_EXPIRED');
    const channel = channelOf(row.kind);
    const prepared = await this.connections.prepareMetaSend(
      storeId,
      row.channelConnectionId,
      channel,
    );
    await this.claimPrivateReply(storeId, row, actor.kind === 'system');
    try {
      await this.connections.sendMetaPrivateReply(prepared, {
        channel,
        externalCommentId: row.externalCommentId,
        text: body,
      });
    } catch (error) {
      // Only a refusal proves nothing was sent; after an outage the reply may have gone out.
      if (isDefiniteRejection(error))
        await this.repository.releasePrivateReply(storeId, id, this.clock.now());
      throw providerError(error);
    }
    await this.transaction.run(storeId, async () => {
      await this.repository.markReplied(storeId, id, {}, this.clock.now());
      await this.record(storeId, actor, {
        action: 'comment.replied_privately',
        id,
        state: 'replied',
      });
    });
  }

  private claimPrivateReply(storeId: string, row: CommentRow, onlyUnanswered: boolean) {
    return this.transaction.runLocked(storeId, async () => {
      const windowClosesAt = privateReplyClosesAt(row);
      const contactId = await this.currentContactId(storeId, row);
      if (contactId) {
        const { decision } = await this.sendPolicy.checkForSend(storeId, {
          contactId,
          channel: channelOf(row.kind),
          category: 'staff_reply',
          windowClosesAt,
        });
        if (
          decision.action !== 'send' ||
          (onlyUnanswered && !(await this.mayReplyAutomatically(storeId, contactId)))
        )
          throw commentError('COMMENT_PRIVATE_REPLY_BLOCKED');
      }
      const now = this.clock.now();
      if (now >= windowClosesAt) throw commentError('COMMENT_PRIVATE_REPLY_EXPIRED');
      if (!(await this.repository.claimPrivateReply(storeId, row.id, now, onlyUnanswered)))
        throw commentError('COMMENT_PRIVATE_REPLY_USED');
    });
  }

  // A comment can arrive before its author has a contact, so the contact saved on it may be missing or old.
  private async currentContactId(storeId: string, row: CommentRow) {
    if (!row.authorExternalId) return row.contactId;
    const identity = await this.identities.findActiveChannelIdentity(storeId, {
      channel: channelOf(row.kind),
      connectionId: row.channelConnectionId,
      externalId: row.authorExternalId,
    });
    return identity?.contactId ?? row.contactId;
  }

  private async mayReplyAutomatically(storeId: string, contactId: string) {
    const contact = await this.contacts.findRecipient(storeId, contactId);
    if (!contact || contact.kind === 'not_customer') return false;
    const consent = await this.consent.current(storeId, [contactId], 'messenger');
    return !consent.some(({ status }) => status === 'withdrawn');
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
      await this.record(
        storeId,
        { kind: 'user', userId },
        {
          action: hidden ? 'comment.hidden' : 'comment.unhidden',
          id,
          state: hidden ? 'hidden' : 'visible',
        },
      );
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
    actor: AuditEntry['actor'],
    change: { action: string; id: string; state: string },
  ) {
    return this.audit.record(storeId, {
      actor,
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
