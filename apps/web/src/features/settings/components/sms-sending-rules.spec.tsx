// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ToastProvider } from '@dakly/ui/toast';

import { SmsSendingRules } from './sms-sending-rules';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const requests: { method: string; url: string; body?: unknown }[] = [];
const storeSettings = (sms: object = {}) => ({
  id: 'store',
  sending: {
    quietHours: { startHour: 21, endHour: 9 },
    frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
    onlyOwnersAndAdminsApprove: true,
    sms: { quietHoursOn: true, dailyLimit: { on: true, perDay: 2000 }, ...sms },
  },
});

function show(canEdit = true, sms: object = {}) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method: init.method ?? 'GET', url, body });
    const saved = init.method === 'PATCH' ? storeSettings() : storeSettings(sms);
    return Response.json(saved, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewStoreSettings: true, canEditStoreSettings: canEdit },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SmsSendingRules />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requests.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('saves the night pause switch right away and keeps the other rules', async () => {
  const user = userEvent.setup();
  show();
  const night = await screen.findByRole('switch', { name: 'Don’t send at night' });
  expect(night.getAttribute('aria-checked')).toBe('true');
  expect((screen.getByLabelText('Pause from') as HTMLInputElement).value).toBe('21:00');

  await user.click(night);

  await waitFor(() => expect(requests.some((entry) => entry.method === 'PATCH')).toBe(true));
  const patch = requests.find((entry) => entry.method === 'PATCH')!;
  expect(patch.body).toEqual({
    sending: {
      quietHours: { startHour: 21, endHour: 9 },
      frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
      onlyOwnersAndAdminsApprove: true,
      sms: { quietHoursOn: false, dailyLimit: { on: true, perDay: 2000 } },
    },
  });
  expect(await screen.findByText('Sending rules saved.')).toBeTruthy();
});

it('refuses a pause time off the hour or outside 8 to 10 pm and does not save it', async () => {
  const user = userEvent.setup();
  show();
  const from = (await screen.findByLabelText('Pause from')) as HTMLInputElement;

  await user.clear(from);
  await user.type(from, '18:30');
  await user.tab();

  expect(
    await screen.findByText('Choose a time on the hour from 8:00 pm to 10:00 pm.'),
  ).toBeTruthy();
  expect(requests.some((entry) => entry.method === 'PATCH')).toBe(false);
});

it('saves a new daily limit and refuses a limit that is not a whole number', async () => {
  const user = userEvent.setup();
  show();
  const limit = (await screen.findByLabelText('Most SMS per day')) as HTMLInputElement;

  await user.clear(limit);
  await user.type(limit, '0');
  await user.tab();
  expect(await screen.findByText('Enter a whole number from 1 to 1,000,000.')).toBeTruthy();
  expect(requests.some((entry) => entry.method === 'PATCH')).toBe(false);

  await user.clear(limit);
  await user.type(limit, '1500');
  await user.tab();
  await waitFor(() => expect(requests.some((entry) => entry.method === 'PATCH')).toBe(true));
  const body = requests.find((entry) => entry.method === 'PATCH')!.body as {
    sending: { sms: unknown };
  };
  expect(body.sending.sms).toEqual({ quietHoursOn: true, dailyLimit: { on: true, perDay: 1500 } });
});

it('shows the limit off text and no limit field, and disables the rules without edit access', async () => {
  show(false, { dailyLimit: { on: false, perDay: 2000 } });
  expect(await screen.findByText(/Campaigns go to everyone on the same day/)).toBeTruthy();
  expect(screen.queryByLabelText('Most SMS per day')).toBeNull();
  expect(screen.getByRole('switch', { name: 'Daily sending limit' }).hasAttribute('disabled')).toBe(
    true,
  );
});
