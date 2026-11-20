import { describe, expect, it } from 'vitest';

import { automationTemplates } from '@dakly/contracts/automations/templates';

import type { ContactsService } from '../contacts/contacts.service';
import type { OrderReportingService } from '../orders/order-reporting.service';
import type { SegmentsService } from '../segments/segments.service';
import type { SendPolicyService } from '../sending/send-policy.service';
import { AutomationConditionsService } from './automation-conditions.service';
import type { AutomationRunsRepository } from './automation-runs.repository';
import type { OrderProgress, RunFacts } from './automation-step-rules';

const graph = automationTemplates.cod_order_confirmation.graph;
const at = new Date('2026-11-20T10:00:00.000Z');

function conditions(progress: OrderProgress | undefined) {
  const orders = { progress: async () => progress } as unknown as OrderReportingService;
  const unused = {} as never;
  return new AutomationConditionsService(
    unused as SegmentsService,
    unused as SendPolicyService,
    unused as ContactsService,
    orders,
    unused as AutomationRunsRepository,
  );
}

function facts(orderId: string | null): RunFacts {
  return {
    graph,
    automationId: 'a',
    storeId: 's',
    runId: 'r',
    contactId: 'c',
    tags: [],
    tappedStepKeys: [],
    wakeAt: null,
    orderId,
  };
}

describe('COD confirmation exits', () => {
  it('lets an order still waiting for confirmation go on to its messages', async () => {
    const waiting = { isConfirmed: false, isCancelled: false };
    expect(await conditions(waiting).exitReason(graph, facts('o'), at)).toBeUndefined();
  });

  it('exits for an order saved as confirmed, before any message', async () => {
    const confirmed = { isConfirmed: true, isCancelled: false };
    expect(await conditions(confirmed).exitReason(graph, facts('o'), at)).toBe('exit_condition');
  });

  it('exits for an order the customer or staff cancelled', async () => {
    const cancelled = { isConfirmed: false, isCancelled: true };
    expect(await conditions(cancelled).exitReason(graph, facts('o'), at)).toBe('exit_condition');
  });

  it('does not exit when the order is gone', async () => {
    expect(await conditions(undefined).exitReason(graph, facts('o'), at)).toBeUndefined();
  });
});
