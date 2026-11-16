import { Inject, Injectable } from '@nestjs/common';

import type { SegmentCountResponse, SegmentRules } from '@dakly/contracts/segments';

import { ContactsService } from '../contacts/contacts.service';

@Injectable()
export class SegmentsService {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  // Counted live on each call: membership is not stored (feature 03).
  async count(storeId: string, rules: SegmentRules): Promise<SegmentCountResponse> {
    return { count: await this.contacts.countMatching(storeId, rules) };
  }
}
