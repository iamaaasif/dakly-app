import { describe, expect, it } from 'vitest';

import type { AutomationStatus } from '@dakly/contracts/automations';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import type { StoreAccess } from '@dakly/contracts/team';

import type { AnalyticsService } from '../analytics/analytics.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { StoresService } from '../stores/stores.service';
import type { TeamService } from '../team/team.service';
import type { WalletService } from '../wallets/wallet.service';
import type { AutomationAnalyticsRepository } from './automation-analytics.repository';
import type { Automation, AutomationsRepository } from './automations.repository';
import { AutomationsService } from './automations.service';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const AUTOMATION_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
const staff = { kind: 'user', userId: 'c5a0f0e4-0b55-4b7e-8d0e-6f3c3b7f1e21' } as const;
const access = (role: 'owner' | 'marketer'): StoreAccess => ({
  role,
  areas: { automations: 'edit' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
});
const owner = { access: access('owner'), actor: staff };
const now = new Date('2026-11-16T05:00:00Z');
const welcome = automationTemplates.welcome_new_subscriber.graph;

// One draft workflow in memory; publish always gets version 1.
class FakeAutomationsRepository {
  automation: Automation | undefined;

  async find() {
    return this.automation;
  }

  async insertVersion() {
    return {
      id: 'b1e2c3d4-0000-7000-8000-000000000001',
      version: 1,
      isStopped: false,
      publishedAt: now,
    };
  }

  async change(
    _storeId: string,
    { from }: { from: readonly AutomationStatus[] },
    change: Partial<Automation>,
  ) {
    if (!this.automation || !from.includes(this.automation.status)) return undefined;
    this.automation = { ...this.automation, ...change };
    return this.automation;
  }
}

function serviceFor(graph: AutomationGraph) {
  const repository = new FakeAutomationsRepository();
  repository.automation = {
    id: AUTOMATION_ID,
    name: 'স্বাগতম',
    status: 'draft',
    pauseReason: null,
    templateKey: null,
    graph,
    publishedVersionId: null,
    createdAt: now,
    updatedAt: now,
  };
  const transaction = { run: (_storeId: string, work: () => Promise<unknown>) => work() };
  return new AutomationsService(
    repository as unknown as AutomationsRepository,
    {} as AutomationAnalyticsRepository,
    transaction as unknown as StoreTransaction,
    { now: () => now } as Clock,
    {
      sendingSettings: async () => ({ onlyOwnersAndAdminsApprove: true }),
    } as unknown as StoresService,
    {
      canApproveSends: () => true,
    } as unknown as TeamService,
    { notify: async () => undefined } as unknown as NotificationsService,
    {} as WalletService,
    {
      periods: async () => ({ current: { from: '2026-11-01', through: '2026-11-30' } }),
      attributionBySource: async (
        _storeId: string,
        _period: unknown,
        _source: string,
        ids: string[],
      ) => Object.fromEntries(ids.map((id) => [id, { orders: '0', revenuePoisha: '0' }])),
    } as unknown as AnalyticsService,
  );
}

const sms = (next: string): AutomationStep => ({
  kind: 'send',
  category: 'marketing',
  channels: ['sms'],
  message: { text: 'নতুন শাড়ি এসেছে', buttons: [] },
  ifNotReachable: 'skip',
  reviewBeforeSending: false,
  next,
});
const repliedSplit: AutomationStep = {
  kind: 'condition',
  paths: [{ condition: { kind: 'replied', stepKey: 'offer', buttonKeys: [] }, next: 'end' }],
  elseNext: 'end',
};

function withWait(wait: AutomationStep): AutomationGraph {
  return {
    ...welcome,
    firstStepKey: 'offer',
    steps: { offer: sms('wait'), wait, split: repliedSplit, end: { kind: 'exit' } },
  };
}

describe('AutomationsService publish checks', () => {
  it('counts the timeout of a wait for a reply toward the 2 hours before a split', async () => {
    const graph = withWait({
      kind: 'wait',
      wait: { until: 'event', event: 'replied', stepKey: 'offer', timeoutMinutes: 120 },
      next: 'split',
    });

    expect((await serviceFor(graph).publish(STORE_ID, AUTOMATION_ID, owner)).status).toBe('active');
  });

  it('does not count a wait for a time of day, which may end a minute later', async () => {
    const graph = withWait({
      kind: 'wait',
      wait: { until: 'time_of_day', time: '10:00' },
      next: 'split',
    });

    await expect(serviceFor(graph).publish(STORE_ID, AUTOMATION_ID, owner)).rejects.toMatchObject({
      code: 'AUTOMATION_SPLIT_TOO_SOON',
      fields: [{ path: 'steps.split', message: 'Less than 2 hours after offer' }],
    });
  });

  it('checks the shortest path from the send to the split', async () => {
    const graph: AutomationGraph = {
      ...welcome,
      firstStepKey: 'offer',
      steps: {
        offer: sms('branch'),
        branch: {
          kind: 'random_split',
          paths: [
            { percent: 50, next: 'long' },
            { percent: 50, next: 'split' },
          ],
        },
        long: { kind: 'wait', wait: { until: 'duration', minutes: 24 * 60 }, next: 'split' },
        split: repliedSplit,
        end: { kind: 'exit' },
      },
    };

    await expect(serviceFor(graph).publish(STORE_ID, AUTOMATION_ID, owner)).rejects.toMatchObject({
      code: 'AUTOMATION_SPLIT_TOO_SOON',
    });
  });

  it.each([
    [
      'a tap condition',
      {
        ...welcome,
        firstStepKey: 'split',
        steps: {
          split: {
            kind: 'condition',
            paths: [{ condition: { kind: 'tapped', stepKey: 'offer' }, next: 'end' }],
            elseNext: 'end',
          },
          offer: sms('end'),
          end: { kind: 'exit' },
        },
      },
      'AUTOMATION_TAPS_UNAVAILABLE',
      'steps.split',
    ],
    [
      'a tap exit',
      { ...welcome, exitConditions: [{ kind: 'tapped_link' }] },
      'AUTOMATION_TAPS_UNAVAILABLE',
      'exitConditions',
    ],
    [
      'a tap goal',
      { ...welcome, goal: { kind: 'tapped_link' } },
      'AUTOMATION_TAPS_UNAVAILABLE',
      'goal',
    ],
    [
      'review before sending',
      {
        ...welcome,
        firstStepKey: 'offer',
        steps: { offer: { ...sms('end'), reviewBeforeSending: true }, end: { kind: 'exit' } },
      },
      'AUTOMATION_REVIEW_UNAVAILABLE',
      'steps.offer',
    ],
    [
      'handing to a person',
      {
        ...welcome,
        firstStepKey: 'act',
        steps: {
          act: { kind: 'action', action: { action: 'hand_to_person' }, next: 'end' },
          end: { kind: 'exit' },
        },
      },
      'AUTOMATION_ACTION_UNAVAILABLE',
      'steps.act',
    ],
  ] as const)('refuses %s, which the runner cannot do yet', async (_case, graph, code, path) => {
    await expect(
      serviceFor(graph as AutomationGraph).publish(STORE_ID, AUTOMATION_ID, owner),
    ).rejects.toMatchObject({ code, fields: [expect.objectContaining({ path })] });
  });

  it('publishes a tag action', async () => {
    const graph: AutomationGraph = {
      ...welcome,
      firstStepKey: 'act',
      steps: {
        act: { kind: 'action', action: { action: 'add_tag', tag: 'vip' }, next: 'end' },
        end: { kind: 'exit' },
      },
    };
    expect((await serviceFor(graph).publish(STORE_ID, AUTOMATION_ID, owner)).status).toBe('active');
  });

  it('publishes a birthday workflow, whose dates live on contacts', async () => {
    const graph = automationTemplates.birthday.graph;

    expect((await serviceFor(graph).publish(STORE_ID, AUTOMATION_ID, owner)).status).toBe('active');
  });
});
