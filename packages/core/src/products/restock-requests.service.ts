import { Inject, Injectable } from '@nestjs/common';

import {
  type AddRestockRequestInput,
  MAX_RESTOCK_NOTIFICATIONS_PER_APPROVAL,
  type RestockNotificationResponse,
  type RestockRequestListQuery,
  type RestockRequestListResponse,
  type RestockRequestResponse,
  type RestockWaitingResponse,
} from '@dakly/contracts/restock-requests';

import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { productError } from './products.errors';
import { type RestockRequest, RestockRequestsRepository } from './restock-requests.repository';

function toResponse(row: RestockRequest): RestockRequestResponse {
  return {
    id: row.id,
    variantId: row.variantId,
    contactId: row.contactId,
    conversationId: row.conversationId,
    status: row.status,
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// The "tell me when it is back" list. Staff and the AI agent add people; a person approves the
// message when stock returns, so nothing here sends on its own.
@Injectable()
export class RestockRequestsService {
  constructor(
    @Inject(RestockRequestsRepository) private readonly repository: RestockRequestsRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Asking twice keeps one waiting row. A size with stock is refused: the person can order it.
  async addToWaitingList(
    storeId: string,
    variantId: string,
    input: AddRestockRequestInput,
  ): Promise<RestockRequestResponse> {
    const variant = await this.repository.findVariant(storeId, variantId);
    if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
    if (variant.available > 0) throw productError('RESTOCK_VARIANT_IN_STOCK');
    if (!(await this.contacts.findRecipient(storeId, input.contactId)))
      throw productError('RESTOCK_CONTACT_NOT_FOUND');
    const request = await this.repository.insertWaiting(storeId, {
      variantId,
      contactId: input.contactId,
      conversationId: input.conversationId ?? null,
    });
    return toResponse(request!);
  }

  async list(storeId: string, query: RestockRequestListQuery): Promise<RestockRequestListResponse> {
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map(toResponse);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async waitingByProduct(storeId: string, productId: string): Promise<RestockWaitingResponse> {
    return { items: await this.repository.countWaitingByVariant(storeId, productId) };
  }

  async cancel(storeId: string, id: string): Promise<void> {
    if (!(await this.repository.cancel(storeId, id)))
      throw productError('RESTOCK_REQUEST_NOT_FOUND');
  }

  // The owner's approval. Each message is queued with a key built from the request, so a retry
  // after a crash queues nothing twice, and a request is marked notified only after its message
  // is queued. People with no chat on a Page stay waiting. The send gate runs when the message is
  // dispatched, not here.
  async notifyWaiting(
    storeId: string,
    variantId: string,
    actor: { kind: 'user'; userId: string },
  ): Promise<RestockNotificationResponse> {
    const variant = await this.repository.findVariant(storeId, variantId);
    if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
    if (variant.available <= 0) throw productError('RESTOCK_VARIANT_STILL_OUT');
    const waiting = await this.repository.listWaiting(
      storeId,
      variantId,
      MAX_RESTOCK_NOTIFICATIONS_PER_APPROVAL,
    );
    const content = `${variant.productName} (${variant.title}) আবার স্টকে এসেছে। অর্ডার করতে চাইলে এখানে জানান।`;
    const queued: string[] = [];
    for (const request of waiting) {
      const route = await this.messaging.latestMessengerRoute(storeId, request.contactId);
      if (!route) continue;
      await this.messaging.queueChannelMessage(storeId, {
        channel: 'messenger',
        contactId: request.contactId,
        connectionId: route.connectionId,
        identityId: route.identityId,
        category: 'transactional',
        content,
        operationKey: `restock-request:${request.id}`,
        actor,
      });
      queued.push(request.id);
    }
    await this.repository.markNotified(storeId, queued, this.clock.now());
    return {
      queued: queued.length,
      waiting: await this.repository.countWaiting(storeId, variantId),
    };
  }
}
