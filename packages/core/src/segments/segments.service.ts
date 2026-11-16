import { Inject, Injectable } from '@nestjs/common';

import {
  type AvailableSegmentCondition,
  type AvailableSegmentRules,
  type SegmentCondition,
  type SegmentCountResponse,
  type SegmentGroup,
  segmentFieldsWaiting,
} from '@dakly/contracts/segments';

import { ContactsService } from '../contacts/contacts.service';
import { segmentError } from './segments.errors';

@Injectable()
export class SegmentsService {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  // Counted live on each call: membership is not stored (feature 03).
  async count(storeId: string, rules: SegmentGroup): Promise<SegmentCountResponse> {
    return { count: await this.contacts.countMatching(storeId, availableRules(rules)) };
  }
}

// Refuses fields whose data does not exist yet, naming the task that brings it.
function availableRules(group: SegmentGroup, path = 'rules'): AvailableSegmentRules {
  return {
    match: group.match,
    conditions: group.conditions.map((item, index) => {
      const itemPath = `${path}.conditions.${index}`;
      if ('match' in item) return availableRules(item, itemPath);
      if (!isAvailable(item))
        throw segmentError('SEGMENT_FIELD_NOT_AVAILABLE', [
          {
            path: `${itemPath}.field`,
            message: `Not available until ${segmentFieldsWaiting[item.field]}`,
          },
        ]);
      return item;
    }),
  };
}

function isAvailable(condition: SegmentCondition): condition is AvailableSegmentCondition {
  return !(condition.field in segmentFieldsWaiting);
}
