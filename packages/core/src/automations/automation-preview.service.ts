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
    let after: (typeof items)[number] | undefined;
    for (;;) {
      const rows = await this.repository.list(storeId, selection, after);
      for (const row of rows) {
        if (segment && !(await this.segments.hasContact(storeId, segment.segmentId, row.contactId)))
          continue;
        items.push(row);
        if (items.length === PREVIEW_LIMIT) return { items };
      }
      if (rows.length < TRIGGER_PREVIEW_PAGE_SIZE) return { items };
      after = rows.at(-1);
    }
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
