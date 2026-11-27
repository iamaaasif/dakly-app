import { describe, expect, it } from 'vitest';

import { automationTemplates } from '@dakly/contracts/automations/templates';

import type { ContactsService } from '../contacts/contacts.service';
import type { MessagingService } from '../messaging/messaging.service';
import type { OrderReportingService } from '../orders/order-reporting.service';
import type { SegmentsService } from '../segments/segments.service';
import type { SendPolicyService } from '../sending/send-policy.service';
import { AutomationConditionsService } from './automation-conditions.service';
import type { AutomationRunsRepository } from './automation-runs.repository';
import type { OrderProgress, RunFacts, SendStep } from './automation-step-rules';

const graph = automationTemplates.cod_order_confirmation.graph;
const reminder = graph.steps.remind as SendStep;
const at = new Date('2026-11-20T10:00:00.000Z');

function conditions(progress: OrderProgress | undefined) {
  const orders = { progress: async () => progress } as unknown as OrderReportingService;
  const unused = {} as never;
  const contacts = { findTags: async () => [] } as unknown as ContactsService;
  const repository = { listTappedStepKeys: async () => [] } as unknown as AutomationRunsRepository;
  return new AutomationConditionsService(
    unused as SegmentsService,
    unused as SendPolicyService,
    { latestChatRoute: async () => undefined } as unknown as MessagingService,
    contacts,
    orders,
    repository,
  );
}

function facts(orderId: string | null): RunFacts {
  return {
    graph,
    automationId: 'a',
    templateKey: 'cod_order_confirmation',
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
    const waiting = { isConfirmed: false, isCancelled: false, isAwaitingConfirmation: true };
    expect(await conditions(waiting).exitReason(graph, facts('o'), at)).toBeUndefined();
  });

  it('exits for an order saved as confirmed, before any message', async () => {
    const confirmed = { isConfirmed: true, isCancelled: false, isAwaitingConfirmation: false };
    expect(await conditions(confirmed).exitReason(graph, facts('o'), at)).toBe('exit_condition');
  });

  it('exits for an order the customer or staff cancelled', async () => {
    const cancelled = { isConfirmed: false, isCancelled: true, isAwaitingConfirmation: false };
    expect(await conditions(cancelled).exitReason(graph, facts('o'), at)).toBe('exit_condition');
  });

  it('does not exit when the order is gone', async () => {
    expect(await conditions(undefined).exitReason(graph, facts('o'), at)).toBeUndefined();
  });

  it('sends the reminder only while the order waits in To confirm', async () => {
    const waiting = { isConfirmed: false, isCancelled: false, isAwaitingConfirmation: true };
    expect(await conditions(waiting).refreshExitReason(facts('o'), reminder, at)).toBeUndefined();
  });

  it('ends the run before the reminder when the order was put on hold', async () => {
    const onHold = { isConfirmed: false, isCancelled: false, isAwaitingConfirmation: false };
    expect(await conditions(onHold).refreshExitReason(facts('o'), reminder, at)).toBe(
      'order_not_awaiting_confirmation',
    );
  });

  it('sends again for an order that came back to To confirm', async () => {
    // Read fresh at each send, so a move back to To confirm lets the reminder go out.
    const back = { isConfirmed: false, isCancelled: false, isAwaitingConfirmation: true };
    expect(await conditions(back).refreshExitReason(facts('o'), reminder, at)).toBeUndefined();
  });

  it('does not hold a message without the confirm link', async () => {
    const onHold = { isConfirmed: false, isCancelled: false, isAwaitingConfirmation: false };
    const plain = { ...reminder, message: { text: 'ধন্যবাদ {first_name}', buttons: [] } };
    expect(await conditions(onHold).refreshExitReason(facts('o'), plain, at)).toBeUndefined();
  });

  it('holds a message with COD buttons even when the fallback link was removed', async () => {
    const onHold = { isConfirmed: false, isCancelled: false, isAwaitingConfirmation: false };
    const step = {
      ...reminder,
      message: { ...reminder.message, text: 'অর্ডারটি এখনো নিশ্চিত হয়নি।' },
    };
    expect(await conditions(onHold).refreshExitReason(facts('o'), step, at)).toBe(
      'order_not_awaiting_confirmation',
    );
  });
});
