// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
