import { Inject, Injectable } from '@nestjs/common';

import type { AutomationTriggerPreview } from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import { Clock } from '../platform/clock';
import { SegmentsService } from '../segments/segments.service';
import {
  AutomationPreviewRepository,
  type PreviewSelection,
  TRIGGER_PREVIEW_PAGE_SIZE,
} from './automation-preview.repository';
import { automationError } from './automations.errors';
import { AutomationsRepository } from './automations.repository';

const PREVIEW_LIMIT = 10;
const MAX_PREVIEW_PAGES = 10;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AutomationPreviewService {
  constructor(
    @Inject(AutomationsRepository) private readonly workflows: AutomationsRepository,
    @Inject(AutomationPreviewRepository) private readonly repository: AutomationPreviewRepository,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async preview(storeId: string, automationId: string): Promise<AutomationTriggerPreview> {
    const automation = await this.workflows.find(storeId, automationId);
    if (!automation || automation.status === 'archived')
      throw automationError('AUTOMATION_NOT_FOUND');
    const { trigger } = automation.graph;
    const selection = selectEvents(trigger);
    if (!selection) return { items: [], lastSevenDays: { people: 0, atLeast: false } };

    const segment = trigger.filters.find((filter) => filter.field === 'segment');
    return this.scan(storeId, selection, segment?.segmentId);
  }

  // Newest events first, until the 7-day mark or the page limit.
  private async scan(storeId: string, selection: PreviewSelection, segmentId?: string) {
    const since = this.clock.now().getTime() - SEVEN_DAYS_MS;
    const items: AutomationTriggerPreview['items'] = [];
    const people = new Set<string>();
    let rows: AutomationTriggerPreview['items'] = [];
    let atLeast = false;
    for (let page = 0; page < MAX_PREVIEW_PAGES; page += 1) {
      rows = await this.repository.list(storeId, selection, rows.at(-1));
      const matches = segmentId ? await this.inSegment(storeId, segmentId, rows) : rows;
      items.push(...matches.slice(0, PREVIEW_LIMIT - items.length));
      for (const match of matches) {
        if (Date.parse(match.occurredAt) >= since) people.add(match.contactId);
      }
      const reachedOlder = rows.length > 0 && Date.parse(rows.at(-1)!.occurredAt) < since;
      if (rows.length < TRIGGER_PREVIEW_PAGE_SIZE || reachedOlder) break;
      atLeast = page === MAX_PREVIEW_PAGES - 1;
    }
    return { items, lastSevenDays: { people: people.size, atLeast } };
  }

  private async inSegment(
    storeId: string,
    segmentId: string,
    rows: AutomationTriggerPreview['items'],
  ) {
    if (rows.length === 0) return rows;
    const ids = await this.segments.matchingContactIds(
      storeId,
      segmentId,
      rows.map(({ contactId }) => contactId),
    );
    const members = new Set(ids);
    return rows.filter(({ contactId }) => members.has(contactId));
  }
}

function selectEvents({ key, filters }: AutomationGraph['trigger']): PreviewSelection | undefined {
  switch (key) {
    case 'consent_given':
      return {
        type: 'consent.changed',
        channels: filters.find((filter) => filter.field === 'channel')?.channels,
        sources: filters.find((filter) => filter.field === 'consent_source')?.sources,
      };
    case 'tag_added':
      return {
        type: 'contact.tag_added',
        tag: filters.find((filter) => filter.field === 'tag')?.tag,
      };
    case 'birthday':
      return { type: 'contact.birthday' };
  }
}
