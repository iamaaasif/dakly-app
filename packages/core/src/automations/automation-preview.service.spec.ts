import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Clock } from '../platform/clock';
import type { SegmentsService } from '../segments/segments.service';
import type { AutomationPreviewRepository } from './automation-preview.repository';
import { AutomationPreviewService } from './automation-preview.service';
import type { AutomationsRepository } from './automations.repository';

const clock = { now: () => new Date(Date.UTC(2026, 10, 20)) } as Clock;

describe('AutomationPreviewService', () => {
  it('returns the segment matches found among the newest 1,000 birthday events', async () => {
    const segmentId = randomUUID();
    const events = Array.from({ length: 1001 }, (_, index) => ({
      id: randomUUID(),
      contactId: randomUUID(),
      occurredAt: new Date(Date.UTC(2026, 10, 19) - index * 1000).toISOString(),
    }));
    const newest = events[0]!;
    const lastWithinCap = events[999]!;
    const older = events[1000]!;
    const members = new Set([newest.contactId, lastWithinCap.contactId, older.contactId]);
    const workflows = {
      find: async () => ({
        status: 'draft',
        graph: { trigger: { key: 'birthday', filters: [{ field: 'segment', segmentId }] } },
      }),
    } as unknown as AutomationsRepository;
    const repository = {
      list: async (_storeId: string, _selection: object, after?: { id: string }) => {
        const start = events.findIndex(({ id }) => id === after?.id) + 1;
        return events.slice(start, start + 100);
      },
    } as unknown as AutomationPreviewRepository;
    const segments = {
      matchingContactIds: async (_storeId: string, _segmentId: string, contactIds: string[]) =>
        contactIds.filter((id) => members.has(id)),
    } as unknown as SegmentsService;
    const service = new AutomationPreviewService(workflows, repository, segments, clock);

    expect(await service.preview(randomUUID(), randomUUID())).toEqual({
      items: [newest, lastWithinCap],
      lastSevenDays: { people: 2, atLeast: true },
    });
  });

  it('counts each person once and stops at the first event older than 7 days', async () => {
    const contactId = randomUUID();
    const event = (days: number) => ({
      id: randomUUID(),
      contactId,
      occurredAt: new Date(Date.UTC(2026, 10, 20) - days * 24 * 60 * 60 * 1000).toISOString(),
    });
    const events = [event(1), event(2), event(8)];
    const workflows = {
      find: async () => ({
        status: 'draft',
        graph: { trigger: { key: 'birthday', filters: [] } },
      }),
    } as unknown as AutomationsRepository;
    const repository = { list: async () => events } as unknown as AutomationPreviewRepository;
    const service = new AutomationPreviewService(
      workflows,
      repository,
      {} as SegmentsService,
      clock,
    );

    expect(await service.preview(randomUUID(), randomUUID())).toEqual({
      items: events,
      lastSevenDays: { people: 1, atLeast: false },
    });
  });
});
