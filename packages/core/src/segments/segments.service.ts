import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type ChangeSegmentInput,
  type CreateSegmentInput,
  MAX_SEGMENTS_PER_STORE,
  type SegmentCountResponse,
  type SegmentListQuery,
  type SegmentListItem,
  type SegmentListResponse,
  type SegmentResponse,
  type SegmentRules,
  type SegmentTabCountsResponse,
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
    const page = rows.slice(0, query.limit);
    const items: SegmentListItem[] = await Promise.all(
      page.map(async (segment) => ({
        ...toSegmentResponse(segment),
        contactCount: await this.contacts.countMatching(storeId, segment.rules),
      })),
    );
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async tabCounts(storeId: string): Promise<SegmentTabCountsResponse> {
    const { active, archived } = await this.repository.countByStatus(storeId);
    return { all: active + archived, active, archived };
  }

  async archive(storeId: string, segmentId: string): Promise<SegmentResponse> {
    return this.setArchived(storeId, segmentId, this.clock.now());
  }

  async unarchive(storeId: string, segmentId: string): Promise<SegmentResponse> {
    return this.setArchived(storeId, segmentId, null);
  }

  // A campaign draft may only pick live segments; ids that do not exist are left to the audience
  // checks that already refuse them.
  async assertNotArchived(
    storeId: string,
    audience: { includeSegmentIds?: string[]; excludeSegmentIds?: string[] },
  ): Promise<void> {
    const ids = [...(audience.includeSegmentIds ?? []), ...(audience.excludeSegmentIds ?? [])];
    if ((await this.repository.findArchivedIds(storeId, ids)).length > 0)
      throw segmentError('SEGMENT_ARCHIVED');
  }

  // Counted live on each call: membership is not stored (feature 03).
  async count(storeId: string, rules: SegmentRules): Promise<SegmentCountResponse> {
    return { count: await this.contacts.countMatching(storeId, rules) };
  }

  // Refuses a segment id that does not exist, without counting its contacts.
  async assertExists(storeId: string, segmentId: string): Promise<void> {
    await this.find(storeId, segmentId);
  }

  // The live size of one segment, so a campaign can size its approval; a missing id is refused.
  async contactCount(storeId: string, segmentId: string): Promise<number> {
    const segment = await this.find(storeId, segmentId);
    return this.contacts.countMatching(storeId, segment.rules);
  }

  async contactIds(
    storeId: string,
    segmentId: string,
    page: { cursor?: string; limit: number },
  ): Promise<string[]> {
    const segment = await this.find(storeId, segmentId);
    return this.contacts.listIdsMatching(storeId, segment.rules, page);
  }

  async matchingContactIds(storeId: string, segmentId: string, contactIds: string[]) {
    const segment = await this.repository.find(storeId, segmentId);
    if (!segment) return [];
    return this.contacts.listIdsMatching(storeId, segment.rules, {
      contactIds,
      limit: contactIds.length,
    });
  }

  // A deleted segment holds no one.
  async hasContact(storeId: string, segmentId: string, contactId: string): Promise<boolean> {
    const segment = await this.repository.find(storeId, segmentId);
    return segment ? this.contacts.isMatching(storeId, contactId, segment.rules) : false;
  }

  // The store lock makes the 200-segment limit hold under concurrent saves.
  async create(storeId: string, input: CreateSegmentInput, actor: Actor): Promise<SegmentResponse> {
    return this.transaction.runLocked(storeId, async () => {
      if ((await this.repository.countSaved(storeId)) >= MAX_SEGMENTS_PER_STORE)
        throw segmentError('SEGMENT_LIMIT_REACHED');
      const segment = await this.repository.insert(storeId, {
        ...input,
        createdByUserId: actor.kind === 'user' ? actor.userId : null,
      });
      if (segment === 'name_taken') throw segmentError('SEGMENT_NAME_TAKEN');
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

  private async setArchived(storeId: string, segmentId: string, archivedAt: Date | null) {
    const segment = await this.repository.setArchived(storeId, segmentId, archivedAt);
    if (!segment) throw segmentError('SEGMENT_NOT_FOUND');
    return toSegmentResponse(segment);
  }

  private async find(storeId: string, segmentId: string): Promise<Segment> {
    const segment = await this.repository.find(storeId, segmentId);
    if (!segment) throw segmentError('SEGMENT_NOT_FOUND');
    return segment;
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
    archivedAt: segment.archivedAt?.toISOString() ?? null,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}
