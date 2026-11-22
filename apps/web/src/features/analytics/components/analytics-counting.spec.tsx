// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { replace, show } from './analytics-fixtures';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/use-url-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUrlRouter: () => ({ push: vi.fn(), replace: replace }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('How Dakly counts orders', () => {
  it('says the window in the Money from marketing note and opens the explanation', async () => {
    show({}, { attribution: { windowDays: 3, rebuilding: false, processedOrders: null } });
    expect(
      await screen.findByText(/Orders placed within 3 days of a message or post/),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'How Dakly counts orders' }));
    const sheet = await screen.findByRole('dialog', { name: 'How Dakly counts orders' });
    expect(within(sheet).getByText('What is not counted')).toBeTruthy();
    expect(within(sheet).getByText('Cancelled orders.')).toBeTruthy();
    expect(within(sheet).getByText(/the SMS campaign gets the order/)).toBeTruthy();
  });

  it('lets the owner pick a window and sends it to the store settings', async () => {
    const requests: { url: string; method: string; body: string | null }[] = [];
    show({}, { canChange: true, requests });
    await userEvent.click(await screen.findByRole('button', { name: 'How Dakly counts orders' }));
    const sheet = await screen.findByRole('dialog');
    expect((within(sheet).getByRole('radio', { name: '7 days' }) as HTMLInputElement).checked).toBe(
      true,
    );
    await userEvent.click(within(sheet).getByRole('radio', { name: '3 days' }));
    await waitFor(() =>
      expect(requests.find(({ method }) => method === 'PATCH')).toMatchObject({
        url: expect.stringContaining('/store/attribution'),
        body: JSON.stringify({ windowDays: 3 }),
      }),
    );
  });

  it('shows the window without a way to change it to anyone but the owner', async () => {
    show({}, { canChange: false });
    await userEvent.click(await screen.findByRole('button', { name: 'How Dakly counts orders' }));
    const sheet = await screen.findByRole('dialog');
    expect(
      within(sheet).getByText(/Your window is 7 days. Only the owner can change it./),
    ).toBeTruthy();
    expect(within(sheet).queryByRole('radio')).toBeNull();
  });

  it('shows a banner and dims the numbers while the new window is counted', async () => {
    show({}, { attribution: { windowDays: 3, rebuilding: true, processedOrders: 1200 } });
    const banner = (await screen.findByText('Recalculating with the new 3-day window')).closest(
      '[role=status]',
    )!;
    expect(banner.textContent).toContain('Recalculating with the new 3-day window');
    expect(banner.textContent).toContain('1,200 orders checked so far');
    expect(banner.nextElementSibling?.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Analytics tip and download', () => {
  it('shows the tip under the funnel', async () => {
    show(
      {},
      {
        tip: {
          tip: {
            step: 'tapped',
            currentPercent: 12,
            usualPercent: 18,
            suggestion: 'Put one button in the first line.',
          },
        },
      },
    );
    expect(
      await screen.findByText(
        /12% of people tapped your link this period, against your usual 18%. Put one button in the first line./,
      ),
    ).toBeTruthy();
  });

  it('downloads the open tab for the open period', async () => {
    const requests: { url: string; method: string; body: string | null }[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    );
    show({ tab: 'campaigns', period: 90 }, { requests });
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(
        requests.some(({ url }) => url.includes('/analytics/export?tab=campaigns&period=90')),
      ).toBe(true),
    );
  });
});
