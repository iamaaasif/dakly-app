// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupportSession } from './support-session';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('SupportSession delegation context', () => {
  it('sends the loaded delegation, removes its draft and ignores a late A read after B is verified', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let current = 'delegation-A';
    let resolveRead!: (value: Response) => void;
    let sent: Headers | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith('/session'))
          return Response.json({
            contextTag: current,
            storeName: current,
            staffName: 'Support',
            access: 'write',
            expiresAt: '2026-12-01T00:00:00Z',
          });
        if (options.method === 'GET')
          return new Promise<Response>((resolve) => {
            resolveRead = resolve;
          });
        sent = new Headers(options.headers);
        return Response.json(
          { error: { code: 'SUPPORT_CONTEXT_CHANGED', message: 'Refresh support access' } },
          { status: 409 },
        );
      }),
    );
    render(
      <QueryClientProvider client={client}>
        <SupportSession />
      </QueryClientProvider>,
    );
    await screen.findByText('delegation-A');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'A draft');
    await user.type(screen.getByLabelText('Phone'), '01712345678');
    await user.type(
      screen.getByLabelText('Customer ID supplied by the shop'),
      '11111111-1111-4111-8111-111111111111',
    );
    await user.click(screen.getByRole('button', { name: 'Read customer' }));
    await vi.waitFor(() => expect(resolveRead).toBeDefined());
    current = 'delegation-B';
    await user.click(screen.getByRole('button', { name: 'Create customer' }));
    await vi.waitFor(() => expect(sent).toBeDefined());
    expect(sent!.get('x-support-context')).toBe('delegation-A');
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['support-session'] });
    });
    await screen.findByText('delegation-B');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    await act(async () => {
      resolveRead(
        Response.json({
          id: 'old',
          name: 'Private A result',
          phone: '01712345678',
          contextTag: 'delegation-A',
        }),
      );
    });
    expect(screen.queryByText(/Private A result/)).toBeNull();
    expect(client.getQueriesData({ queryKey: ['support-customer', 'delegation-A'] })).toEqual([]);
  });
});
