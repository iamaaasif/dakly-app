import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  type CreateHandPickedSegmentInput,
  type HandPickedChangeResponse,
  MAX_HAND_PICKED_CONTACTS,
  type SegmentResponse,
  type SegmentRules,
} from '@dakly/contracts/segments';

import { ContactsService } from '../contacts/contacts.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { segmentError } from './segments.errors';
import { SegmentsRepository } from './segments.repository';
import { SegmentsService, toSegmentResponse } from './segments.service';

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

function handPickedRules(contactIds: string[]): SegmentRules {
  return {
    match: 'all',
    conditions: [{ field: 'contact', operator: 'is_any_of', values: contactIds }],
  };
}

// A hand-picked segment is one "customer is any of" condition and nothing else.
function pickedIds(rules: SegmentRules): string[] | undefined {
  const [only] = rules.conditions;
  if (rules.conditions.length !== 1 || !only || 'match' in only) return undefined;
  return only.field === 'contact' && only.operator === 'is_any_of' ? only.values : undefined;
}

// The customers ticked on the list become a segment, or join one. Membership stays inside the
// rules, so campaigns, consent and frequency checks read it like any other segment.
@Injectable()
export class HandPickedSegmentsService {
  constructor(
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SegmentsRepository) private readonly repository: SegmentsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async createFrom(
    storeId: string,
    input: CreateHandPickedSegmentInput,
    actor: Actor,
  ): Promise<SegmentResponse> {
    const contactIds = await this.ownCustomers(storeId, input.contactIds);
    if (!contactIds.length) throw segmentError('SEGMENT_NO_CUSTOMERS');
    const rules = handPickedRules(contactIds);
    if (input.name) return this.segments.create(storeId, { name: input.name, rules }, actor);
    return this.segments.createOneOff(
      storeId,
      { name: `Picked customers (${contactIds.length})`, rules },
      actor,
    );
  }

  // changedIds are the customers who were not in the segment yet, which Undo sends back.
  async add(
    storeId: string,
    segmentId: string,
    contactIds: string[],
    actor: Actor,
  ): Promise<HandPickedChangeResponse> {
    const own = await this.ownCustomers(storeId, contactIds);
    return this.change(storeId, segmentId, actor, (current) => {
      const added = own.filter((id) => !current.includes(id));
      if (current.length + added.length > MAX_HAND_PICKED_CONTACTS)
        throw segmentError('SEGMENT_HAND_PICKED_FULL');
      return { next: [...current, ...added], changedIds: added };
    });
  }

  remove(
    storeId: string,
    segmentId: string,
    contactIds: string[],
    actor: Actor,
  ): Promise<HandPickedChangeResponse> {
    return this.change(storeId, segmentId, actor, (current) => {
      const removed = contactIds.filter((id) => current.includes(id));
      return { next: current.filter((id) => !removed.includes(id)), changedIds: removed };
    });
  }

  // The store lock keeps two members adding at once from overwriting each other's list.
  private change(
    storeId: string,
    segmentId: string,
    actor: Actor,
    edit: (current: string[]) => { next: string[]; changedIds: string[] },
  ): Promise<HandPickedChangeResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const segment = await this.repository.find(storeId, segmentId);
      if (!segment) throw segmentError('SEGMENT_NOT_FOUND');
      const current = pickedIds(segment.rules);
      if (!current) throw segmentError('SEGMENT_NOT_HAND_PICKED');
      const { next, changedIds } = edit(current);
      if (!next.length) throw segmentError('SEGMENT_HAND_PICKED_EMPTY');
      if (!changedIds.length) return { segment: toSegmentResponse(segment), changedIds };
      const saved = await this.segments.change(
        storeId,
        segmentId,
        { rules: handPickedRules(next) },
        actor,
      );
      return { segment: saved, changedIds };
    });
  }

  // Ids from another shop or of deleted customers are dropped, so a segment lists only people
  // this shop can message.
  private ownCustomers(storeId: string, contactIds: string[]): Promise<string[]> {
    return this.contacts.listIdsMatching(storeId, handPickedRules(contactIds), {
      contactIds,
      limit: contactIds.length,
    });
  }
}
