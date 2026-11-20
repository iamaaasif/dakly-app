// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { BrandProfile } from '@dakly/contracts/content';

import { BrandProfileTab } from './brand-profile-tab';
import { sessionContextKey } from '@/lib/session-context';

const saved: BrandProfile = {
  voice: 'Friendly, Quirky',
  audience: 'Women in Dhaka',
  preferredWords: ['comfort', 'everyday'],
  wordsToAvoid: ['cheap'],
  callToActionBn: null,
  callToActionEn: 'Inbox us to order.',
};
const requests: { method: string; body?: unknown }[] = [];

function show(canEdit = true) {
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ method: init.method ?? 'GET', body });
    return Response.json(body ?? saved, { headers: { 'x-session-context': 'verified' } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewSocial: true, canEditSocial: canEdit },
  });
  render(
    <QueryClientProvider client={client}>
      <BrandProfileTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => (requests.length = 0));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the saved profile and saves changes, keeping voice words the chips do not offer', async () => {
  const user = userEvent.setup();
  show();
  expect(
    ((await screen.findByLabelText('Who your customers are')) as HTMLTextAreaElement).value,
  ).toBe('Women in Dhaka');
  expect((screen.getByLabelText('Words you like to use') as HTMLTextAreaElement).value).toBe(
    'comfort, everyday',
  );
  expect(screen.getByRole('button', { name: 'Friendly' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  await user.click(screen.getByRole('button', { name: 'Warm' }));
  await user.type(screen.getByLabelText('Words to never use'), ', guaranteed');
  await user.click(screen.getByRole('button', { name: 'Save brand profile' }));
  expect(await screen.findByText('Brand profile saved')).toBeTruthy();
  expect(requests.find(({ method }) => method === 'PUT')?.body).toEqual({
    voice: 'Friendly, Quirky, Warm',
    audience: 'Women in Dhaka',
    preferredWords: ['comfort', 'everyday'],
    wordsToAvoid: ['cheap', 'guaranteed'],
    callToActionBn: null,
    callToActionEn: 'Inbox us to order.',
  });
});

it('shows a field error and saves nothing when a word is too long', async () => {
  const user = userEvent.setup();
  show();
  await user.type(await screen.findByLabelText('Words you like to use'), `, ${'a'.repeat(81)}`);
  await user.click(screen.getByRole('button', { name: 'Save brand profile' }));
  expect(await screen.findByText(/too big|at most|characters/i)).toBeTruthy();
  expect(requests.some(({ method }) => method === 'PUT')).toBe(false);
});

it('is read only without edit permission', async () => {
  show(false);
  expect(
    ((await screen.findByLabelText('Who your customers are')) as HTMLTextAreaElement).disabled,
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save brand profile' })).toBeNull();
});
