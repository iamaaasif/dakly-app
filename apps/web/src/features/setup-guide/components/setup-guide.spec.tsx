// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SetupChecklistResponse } from '@dakly/contracts/setup-checklist';
import { ToastProvider } from '@dakly/ui/toast';

import { SetupBanner } from './setup-banner';
import { SetupCard } from './setup-card';
import { sessionContextKey } from '@/lib/session-context';

const social: SetupChecklistResponse = {
  howYouSell: ['social_media'],
  hidden: false,
  turnedOn: [],
  steps: [
    { id: 'connect_facebook_page', done: true },
    { id: 'teach_ai_answers', done: false },
    { id: 'add_products', done: false },
    { id: 'chats_to_orders', done: false },
    { id: 'set_up_messaging', done: false },
    { id: 'send_first_campaign', done: false },
  ],
};

function show(checklist: SetupChecklistResponse, canChangeExtensions = true) {
  const requests: { method: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
    requests.push({
      method: init.method ?? 'GET',
      body: init.body && JSON.parse(String(init.body)),
    });
    const response = Response.json(
      init.method === 'PATCH' ? { ...checklist, hidden: true } : checklist,
    );
    response.headers.set('x-session-context', 'verified');
    return response;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { storeId: 'shop-a', canChangeExtensions },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SetupBanner />
        <SetupCard />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return requests;
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('setup guide', () => {
  it('shows progress and gives only the next open step the main button', async () => {
    show(social);
    expect(await screen.findByText('1 of 6 done')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up Dakly' })).toBeNull();
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(6);
    expect(within(steps[0]!).getByText('Done')).toBeTruthy();
    const teach = within(steps[1]!).getByRole('link', { name: 'Teach Dakly' });
    expect(teach.className).toContain('bg-action');
    expect(teach.getAttribute('href')).toBe('/chats?agent=knowledge');
    expect(within(steps[2]!).getByRole('link', { name: 'Add products' }).className).not.toContain(
      'bg-action',
    );
  });

  it('asks the question again only for a shop with no answers', async () => {
    show({ ...social, howYouSell: [], steps: social.steps.slice(4) });
    expect(await screen.findByRole('heading', { name: 'How do you sell?' })).toBeTruthy();
    expect(screen.getByText('0 of 2 done')).toBeTruthy();
  });

  it('keeps the change buttons from members who cannot change the setup', async () => {
    show({ ...social, howYouSell: [] }, false);
    expect(await screen.findByText(/steps to start getting repeat sales/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up Dakly' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change setup' })).toBeNull();
  });

  it('saves the chosen answers from the banner', async () => {
    const requests = show({ ...social, howYouSell: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Set up Dakly' }));
    await userEvent.click(screen.getByRole('button', { name: /Online store/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(requests.at(-2)).toEqual({ method: 'PATCH', body: { howYouSell: ['online_store'] } }),
    );
  });

  it('refuses to save with no answer chosen', async () => {
    const requests = show({ ...social, howYouSell: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Set up Dakly' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Choose at least one way you sell')).toBeTruthy();
    expect(requests.some(({ method }) => method === 'PATCH')).toBe(false);
  });

  it('offers Hide guide once every step is done', async () => {
    const requests = show({ ...social, steps: social.steps.map(({ id }) => ({ id, done: true })) });
    expect(await screen.findByText('You’re all set')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hide guide' }));
    await waitFor(() =>
      expect(requests).toContainEqual({ method: 'PATCH', body: { hidden: true } }),
    );
  });
});
