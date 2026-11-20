// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AutomationStep } from '@dakly/contracts/automations/graph';

import { WorkflowStepPanel } from './workflow-step-panel';

afterEach(cleanup);

function open(step: AutomationStep) {
  const onChange = vi.fn();
  render(
    <WorkflowStepPanel
      step={step}
      number={2}
      settingsHref="/automations/abc"
      onChange={onChange}
      onClose={() => undefined}
    />,
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

  it('sends other steps to the workflow settings', () => {
    open({
      kind: 'condition',
      paths: [{ condition: { kind: 'placed_order' }, next: 'end' }],
      elseNext: 'end',
    });
    expect(screen.getByRole('link', { name: 'workflow settings' }).getAttribute('href')).toBe(
      '/automations/abc',
    );
  });
});
