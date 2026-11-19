import { Inject, Injectable } from '@nestjs/common';

import type { AutomationTriggerPreview } from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import { SegmentsService } from '../segments/segments.service';
import {
  AutomationPreviewRepository,
  type PreviewSelection,
  TRIGGER_PREVIEW_PAGE_SIZE,
} from './automation-preview.repository';
import { automationError } from './automations.errors';
import { AutomationsRepository } from './automations.repository';

const PREVIEW_LIMIT = 10;

@Injectable()
export class AutomationPreviewService {
  constructor(
    @Inject(AutomationsRepository) private readonly workflows: AutomationsRepository,
    @Inject(AutomationPreviewRepository) private readonly repository: AutomationPreviewRepository,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
  ) {}

  async preview(storeId: string, automationId: string): Promise<AutomationTriggerPreview> {
    const automation = await this.workflows.find(storeId, automationId);
    if (!automation || automation.status === 'archived')
      throw automationError('AUTOMATION_NOT_FOUND');
    const { trigger } = automation.graph;
    const selection = selectEvents(trigger);
    if (!selection) return { items: [] };

    const segment = trigger.filters.find((filter) => filter.field === 'segment');
    const items: AutomationTriggerPreview['items'] = [];
    let rows: AutomationTriggerPreview['items'] = [];
    do {
      rows = await this.repository.list(storeId, selection, rows.at(-1));
      const matches = segment ? await this.inSegment(storeId, segment.segmentId, rows) : rows;
      items.push(...matches.slice(0, PREVIEW_LIMIT - items.length));
    } while (rows.length === TRIGGER_PREVIEW_PAGE_SIZE && items.length < PREVIEW_LIMIT);
    return { items };
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
