// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { WorkflowStepPanel } from './workflow-step-panel';

afterEach(cleanup);

function open(step: AutomationStep) {
  const onChange = vi.fn();
  render(
    <WorkflowStepPanel step={step} number={2} onChange={onChange} onClose={() => undefined} />,
  );
  return onChange;
}

describe('WorkflowStepPanel', () => {
  it('changes a message', () => {
    const onChange = open({
      kind: 'send',
      category: 'marketing',
      channels: ['sms'],
      message: { text: 'Hello', buttons: [] },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'end',
    });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi again' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ message: { text: 'Hi again', buttons: [] } }),
    );
  });

  it('asks for a message when it is empty', () => {
    open({
      kind: 'send',
      category: 'marketing',
      channels: ['sms'],
      message: { text: ' ', buttons: [] },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'end',
    });
    expect(screen.getByRole('alert').textContent).toBe('Write the message.');
  });

  it('edits the COD Messenger text separately from the SMS link', () => {
    const step = automationTemplates.cod_order_confirmation.graph.steps.ask!;
    const onChange = open(step);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Fallback message').value).toContain(
      '{confirm_link}',
    );
    fireEvent.change(screen.getByLabelText('Messenger message'), {
      target: { value: 'Your order is ready to confirm.' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          text: expect.stringContaining('{confirm_link}'),
          messengerText: 'Your order is ready to confirm.',
        }),
      }),
    );
  });

  it('changes a delay in minutes and refuses a wait of zero', () => {
    const onChange = open({
      kind: 'wait',
      wait: { until: 'duration', minutes: 2 * 1440 },
      next: 'end',
    });
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('2');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ wait: { until: 'duration', minutes: 3 * 1440 } }),
    );
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Wait between 1 minute and 90 days.');
  });

  it('changes a tag', () => {
    const onChange = open({
      kind: 'action',
      action: { action: 'remove_tag', tag: 'vip' },
      next: 'end',
    });
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'gold' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: { action: 'remove_tag', tag: 'gold' } }),
    );
  });

  it('moves a channel up in the send order', () => {
    const onChange = open({
      kind: 'send',
      category: 'marketing',
      channels: ['sms', 'whatsapp'],
      message: { text: 'Hello', buttons: [] },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'end',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move WhatsApp up' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ['whatsapp', 'sms'] }),
    );
  });

  it('changes the time of day a wait ends', () => {
    const onChange = open({
      kind: 'wait',
      wait: { until: 'time_of_day', time: '09:00' },
      next: 'end',
    });
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '18:30' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ wait: { until: 'time_of_day', time: '18:30' } }),
    );
  });
});

describe('comment reply steps', () => {
  const comment = automationTemplates.comment_to_dm_price.graph.steps;

  it('checks every public wording for a price as the owner types', () => {
    const onChange = open(comment.public!);
    expect(screen.getAllByText('No price, number or link. Safe to post.')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Wording 1'), {
      target: { value: 'দাম মাত্র ৫০০ টাকা' },
    });
    expect(onChange).toHaveBeenCalled();
    cleanup();
    open({
      kind: 'action',
      action: { action: 'reply_to_comment', lines: ['Price 500 taka', 'Inbox e details dilam'] },
      next: 'end',
    });
    expect(screen.getByRole('alert').textContent).toBe('A public reply cannot hold numbers');
  });

  it('keeps between 2 and 5 wordings', () => {
    const wording = (lines: string[]) =>
      ({ kind: 'action', action: { action: 'reply_to_comment', lines }, next: 'end' }) as const;
    open(wording(['Inbox e details dilam', 'ইনবক্সে জানিয়েছি']));
    expect(screen.getByRole('button', { name: 'Remove wording 1' })).toHaveProperty(
      'disabled',
      true,
    );
    cleanup();
    open(wording(['a one', 'a two', 'a three', 'a four', 'a five']));
    expect(screen.queryByRole('button', { name: 'Add a wording' })).toBeNull();
  });

  it('turns the product card on and previews the message', () => {
    const onChange = open(comment.private!);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ includeProduct: false }) }),
    );
  });

  it('lets a send step add Instagram', () => {
    const onChange = open(automationTemplates.price_question_in_chat.graph.steps.follow_up!);
    expect(screen.getByText(/Instagram sends text only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Messenger' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channels: ['instagram'] }));
  });
});
