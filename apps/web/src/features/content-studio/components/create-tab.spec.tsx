// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CreateTab } from './create-tab';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const aiRunId = '00000000-0000-4000-8000-000000000001';
const requests: { method: string; url: string; body?: unknown }[] = [];

function show() {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ method: init.method ?? 'GET', url, body });
    const headers = { 'x-session-context': 'verified' };
    if (url.endsWith('/content-pieces/generate'))
      return Response.json(
        { aiRunId, options: ['First option', 'Second option', 'Third option'] },
        { headers },
      );
    if (url.endsWith('/content-pieces'))
      return Response.json({ id: '11111111-1111-4111-8111-111111111111' }, { headers });
    return Response.json({ items: [], nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditSocial: true, canViewProducts: false },
  });
  render(
    <QueryClientProvider client={client}>
      <CreateTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requests.length = 0;
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('asks for the chosen settings and shows three options', async () => {
  const user = userEvent.setup();
  show();
  await user.type(screen.getByLabelText('What’s it about?'), ' Winter kurtis ');
  await user.click(screen.getByRole('radio', { name: 'English' }));
  await user.click(screen.getByRole('radio', { name: 'Festive' }));
  await user.click(screen.getByRole('button', { name: /Write 3 options/ }));
  const options = await screen.findByRole('list', { name: 'Written options' });
  expect(within(options).getAllByRole('listitem')).toHaveLength(3);
  expect(requests.find(({ url }) => url.endsWith('/generate'))?.body).toEqual({
    operation: 'generate',
    kind: 'facebook_post',
    tone: 'festive',
    language: 'en',
    topic: 'Winter kurtis',
  });
});

it('asks for a topic before writing and sends nothing', async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole('button', { name: /Write 3 options/ }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Enter a topic or choose a saved product',
  );
  expect(requests).toHaveLength(0);
});

it('asks for a saved product when writing a product description', async () => {
  const user = userEvent.setup();
  show();
  await user.click(screen.getByRole('radio', { name: 'Product description' }));
  expect(screen.queryByLabelText('What’s it about?')).toBeNull();
  await user.click(screen.getByRole('button', { name: /Write 3 options/ }));
  expect((await screen.findByRole('alert')).textContent).toBe('Choose a saved product');
});

it('saves an edited option to the library with its AI run', async () => {
  const user = userEvent.setup();
  show();
  await user.type(screen.getByLabelText('What’s it about?'), 'Winter kurtis');
  await user.click(screen.getByRole('button', { name: /Write 3 options/ }));
  const [first] = await screen.findAllByRole('article');
  await user.click(within(first!).getByRole('button', { name: 'Edit' }));
  await user.type(within(first!).getByLabelText('Edit text'), ' today');
  await user.click(within(first!).getByRole('button', { name: 'Save to library' }));
  expect(await within(first!).findByRole('button', { name: 'Saved to library' })).toBeTruthy();
  expect(requests.find(({ url }) => url.endsWith('/content-pieces'))?.body).toEqual({
    kind: 'facebook_post',
    language: 'bn',
    body: 'First option today',
    aiRunId,
  });
});

it('opens Create post with the saved piece and offers no post for an SMS', async () => {
  const user = userEvent.setup();
  show();
  await user.type(screen.getByLabelText('What’s it about?'), 'Winter kurtis');
  await user.click(screen.getByRole('button', { name: /Write 3 options/ }));
  const [first] = await screen.findAllByRole('article');
  await user.click(within(first!).getByRole('button', { name: 'Use in post' }));
  await vi.waitFor(() =>
    expect(push).toHaveBeenCalledWith(
      '/social/posts/new?piece=11111111-1111-4111-8111-111111111111',
    ),
  );
  cleanup();
  show();
  await user.click(screen.getByRole('radio', { name: 'SMS' }));
  await user.type(screen.getByLabelText('What’s it about?'), 'Sale');
  await user.click(screen.getByRole('button', { name: /Write 3 options/ }));
  await screen.findAllByRole('article');
  expect(screen.queryByRole('button', { name: 'Use in post' })).toBeNull();
});
