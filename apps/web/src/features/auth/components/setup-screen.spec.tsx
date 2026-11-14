// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupScreen } from './setup-screen';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Shop setup', () => {
  it.each(['forward', 'back'])(
    'keeps the draft uncommitted and focuses the %s step',
    async (direction) => {
      const posted: unknown[] = [];
      vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
        if (options.method === 'POST') posted.push(JSON.parse(String(options.body)));
        return Response.json({
          plans: [
            {
              code: 'paid',
              name: 'Paid',
              monthlyPricePoisha: 10000,
              yearlyPricePoisha: 100000,
              trialDays: 0,
              limits: { customers: 500 },
            },
          ],
          recommendations: { under_500: 'starter' },
        });
      });
      render(
        <QueryClientProvider client={new QueryClient()}>
          <SetupScreen />
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Business name'), 'Dhaka Books');
      await user.selectOptions(screen.getByLabelText('What you sell'), 'Books and stationery');
      await user.selectOptions(screen.getByLabelText('District'), 'Dhaka');
      await user.click(screen.getByLabelText('Online store'));
      await user.selectOptions(screen.getByLabelText('Customer list size'), 'under_500');
      await user.click(screen.getByRole('button', { name: 'Choose a plan' }));
      await waitFor(() => expect(screen.getByText('Paid')).toBeTruthy());
      expect(posted).toEqual([]);
      expect(screen.getByText(/Payment is required/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start Paid' })).toBeNull();
      expect(screen.queryByText('Recommended')).toBeNull();
      if (direction === 'back') {
        await user.click(screen.getByRole('button', { name: 'Back to business details' }));
        expect((screen.getByLabelText('Business name') as HTMLInputElement).value).toBe(
          'Dhaka Books',
        );
        expect((screen.getByLabelText('District') as HTMLSelectElement).value).toBe('Dhaka');
      }
      expect(document.activeElement).toBe(
        screen.getByRole('heading', {
          name:
            direction === 'forward'
              ? 'Pick a plan · Step 4 of 4'
              : 'Business details · Step 3 of 4',
        }),
      );
    },
  );
});
