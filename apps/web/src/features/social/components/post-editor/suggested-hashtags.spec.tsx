// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { SuggestedHashtags } from './suggested-hashtags';
import { sessionContextKey } from '@/lib/session-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(caption: string, onAdd = vi.fn()) {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { hashtags: ['#UrbanTrend', '#Kurti'] },
      { headers: { 'x-session-context': 'verified' } },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, { contextTag: 'verified', currentStore: {} });
  render(
    <QueryClientProvider client={client}>
      <SuggestedHashtags caption={caption} disabled={false} onAdd={onAdd} />
    </QueryClientProvider>,
  );
  return onAdd;
}

it('offers the saved hashtags that are not in the caption yet and adds the one picked', async () => {
  const onAdd = show('New kurti is here #kurti');
  await userEvent.click(await screen.findByRole('button', { name: '#UrbanTrend' }));
  expect(onAdd).toHaveBeenCalledWith('#UrbanTrend');
  expect(screen.queryByRole('button', { name: '#Kurti' })).toBeNull();
});
