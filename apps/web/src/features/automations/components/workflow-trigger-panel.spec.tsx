// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';

import { WorkflowTriggerPanel } from './workflow-trigger-panel';

vi.mock('@/lib/store-request', () => ({
  useStoreRequest: () => ({ contextTag: undefined, request: vi.fn() }),
}));

afterEach(cleanup);

function Host({ start, seen }: { start: AutomationGraph; seen: (graph: AutomationGraph) => void }) {
  const [graph, setGraph] = useState(start);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <WorkflowTriggerPanel
        graph={graph}
        onChange={(next) => {
          setGraph(next);
          seen(next);
        }}
        onClose={() => undefined}
      />
    </QueryClientProvider>
  );
}

describe('WorkflowTriggerPanel', () => {
  it('sets message filters with plain labels and keeps Bangla, Banglish and mixed keywords', () => {
    const seen = vi.fn();
    render(<Host start={automationTemplates.order_intent_follow_up.graph} seen={seen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Asking price' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wants to order' }));
    const box = screen.getByLabelText('Keywords');
    fireEvent.change(box, { target: { value: 'দাম কত, dam koto, price koto?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    const trigger = seen.mock.calls.at(-1)![0].trigger;
    expect(trigger.filters).toContainEqual({
      field: 'intent',
      intents: ['price'],
    });
    expect(trigger.filters).toContainEqual({
      field: 'keywords',
      keywords: ['দাম কত', 'dam koto', 'price koto?'],
    });
  });

  it('sets the customer total spent in poisha and drops it when the box is cleared', () => {
    const seen = vi.fn();
    render(<Host start={automationTemplates.thank_you_first_order.graph} seen={seen} />);
    const box = screen.getByLabelText('Customer total spent');
    fireEvent.change(box, { target: { value: '10000' } });
    expect(seen.mock.calls.at(-1)![0].trigger.filters).toContainEqual({
      field: 'customer_spend',
      operator: 'at_least',
      amountPoisha: 1_000_000,
    });
    fireEvent.change(screen.getByLabelText('Customer orders'), { target: { value: '3' } });
    expect(seen.mock.calls.at(-1)![0].trigger.filters).toContainEqual({
      field: 'customer_orders',
      operator: 'at_least',
      count: 3,
    });
    fireEvent.change(box, { target: { value: '' } });
    expect(
      seen.mock.calls
        .at(-1)![0]
        .trigger.filters.some((f: { field: string }) => f.field === 'customer_spend'),
    ).toBe(false);
  });

  it('drops a filter when its last choice is untoggled', () => {
    const seen = vi.fn();
    render(<Host start={automationTemplates.price_question_in_chat.graph} seen={seen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Messenger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(seen.mock.calls.at(-1)![0].trigger.filters).toEqual([
      { field: 'intent', intents: ['price'] },
    ]);
  });

  it('shows the comment filters with the post and product pickers', () => {
    render(<Host start={automationTemplates.comment_to_dm_price.graph} seen={vi.fn()} />);
    expect(screen.getByText('Posts')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Has a question' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove দাম কত' })).toBeTruthy();
  });
});

describe('trigger picker', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  async function pick(name: string) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Trigger' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name }));
  }

  it('changes the trigger at once when no step is affected', async () => {
    const seen = vi.fn();
    render(<Host start={automationTemplates.order_intent_follow_up.graph} seen={seen} />);
    await pick('Comment on a post');
    expect(seen.mock.calls.at(-1)![0].trigger.key).toBe('comment_on_post');
  });

  it('asks before it removes comment replies, and keeps the trigger if declined', async () => {
    const start = Object.values(automationTemplates).find(
      (template) => template.graph.trigger.key === 'comment_on_post',
    )!.graph;
    const seen = vi.fn();
    render(<Host start={start} seen={seen} />);
    await pick('Message received');
    expect(await screen.findByText(/only work after a comment/u)).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Change trigger' }));
    expect(seen.mock.calls.at(-1)![0].trigger.key).toBe('message_received');
  });
});
