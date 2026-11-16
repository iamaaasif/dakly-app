import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type ChangeSegmentInput,
  type CreateSegmentInput,
  MAX_SEGMENTS_PER_STORE,
  type SegmentCountResponse,
  type SegmentListQuery,
  type SegmentListResponse,
  type SegmentResponse,
  type SegmentRules,
} from '@dakly/contracts/segments';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { segmentError } from './segments.errors';
import { type Segment, SegmentsRepository } from './segments.repository';

// Writes take the actor (services.md); nothing records it for segments yet.
type Actor = AuditEntry['actor'];

@Injectable()
export class SegmentsService {
  constructor(
    @Inject(SegmentsRepository) private readonly repository: SegmentsRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: SegmentListQuery): Promise<SegmentListResponse> {
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map(toSegmentResponse);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  // Counted live on each call: membership is not stored (feature 03).
  async count(storeId: string, rules: SegmentRules): Promise<SegmentCountResponse> {
    return { count: await this.contacts.countMatching(storeId, rules) };
  }

  async contactIds(
    storeId: string,
    segmentId: string,
    page: { cursor?: string; limit: number },
  ): Promise<string[]> {
    const segment = await this.find(storeId, segmentId);
    return this.contacts.listIdsMatching(storeId, segment.rules, page);
  }

  // The store lock makes the name check and the 200-segment limit hold under concurrent saves.
  async create(storeId: string, input: CreateSegmentInput, actor: Actor): Promise<SegmentResponse> {
    return this.transaction.runLocked(storeId, async () => {
      if ((await this.repository.countSaved(storeId)) >= MAX_SEGMENTS_PER_STORE)
        throw segmentError('SEGMENT_LIMIT_REACHED');
      await this.assertNameFree(storeId, input.name);
      const segment = await this.repository.insert(storeId, {
        ...input,
        createdByUserId: actor.kind === 'user' ? actor.userId : null,
      });
      await this.publishSaved(storeId, segment.id, segment.updatedAt);
      return toSegmentResponse(segment);
    });
  }

  async change(
    storeId: string,
    segmentId: string,
    input: ChangeSegmentInput,
    _actor: Actor,
  ): Promise<SegmentResponse> {
    return this.transaction.run(storeId, async () => {
      const now = this.clock.now();
      // The event goes first: a name clash aborts the transaction, and the throw rolls it back.
      await this.publishSaved(storeId, segmentId, now);
      const segment = await this.repository.change(storeId, segmentId, {
        ...input,
        updatedAt: now,
      });
      if (segment === 'name_taken') throw segmentError('SEGMENT_NAME_TAKEN');
      if (!segment) throw segmentError('SEGMENT_NOT_FOUND');
      return toSegmentResponse(segment);
    });
  }

  // SEG-R2 (in use by a campaign or automation) waits for CAMP-2 and CAMP-5.
  async remove(storeId: string, segmentId: string, _actor: Actor): Promise<void> {
    if (!(await this.repository.remove(storeId, segmentId)))
      throw segmentError('SEGMENT_NOT_FOUND');
  }

  private async find(storeId: string, segmentId: string): Promise<Segment> {
    const segment = await this.repository.find(storeId, segmentId);
    if (!segment) throw segmentError('SEGMENT_NOT_FOUND');
    return segment;
  }

  private async assertNameFree(storeId: string, name: string): Promise<void> {
    if (await this.repository.findIdByName(storeId, name)) throw segmentError('SEGMENT_NAME_TAKEN');
  }

  private async publishSaved(storeId: string, segmentId: string, at: Date) {
    await this.outbox.publish({
      type: 'segment.saved',
      storeId,
      occurredAt: at.toISOString(),
      payload: { segmentId },
    });
  }
}

function toSegmentResponse(segment: Segment): SegmentResponse {
  return {
    ...segment,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}
