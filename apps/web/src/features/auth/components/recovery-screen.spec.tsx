// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryScreen } from './recovery-screen';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
function renderRecovery() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RecoveryScreen />
    </QueryClientProvider>,
  );
}
describe('Public recovery', () => {
  it('removes a notice fragment without cancelling until explicitly confirmed', async () => {
    const recoveryId = '11111111-1111-4111-8111-111111111111';
    const token = 'a'.repeat(43);
    window.history.replaceState(
      null,
      '',
      `/security/recovery#recoveryId=${recoveryId}&cancelToken=${token}`,
    );
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      sent.push(JSON.parse(String(options.body)));
      return new Response(null, { status: 204 });
    });
    renderRecovery();
    expect(window.location.hash).toBe('');
    expect(sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this recovery request' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('cancelled'));
    expect(sent).toEqual([{ recoveryId, token }]);
  });
  it('handles a notice opened while the recovery page is already mounted', async () => {
    renderRecovery();
    await act(async () => {
      window.history.replaceState(
        null,
        '',
        '/security/recovery#recoveryId=11111111-1111-4111-8111-111111111111&cancelToken=' +
          'b'.repeat(43),
      );
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('button', { name: 'Cancel this recovery request' })).toBeTruthy();
    expect(window.location.hash).toBe('');
  });
  it('allows leaving a cancellation notice to start a new request', async () => {
    window.history.replaceState(
      null,
      '',
      '/security/recovery#recoveryId=11111111-1111-4111-8111-111111111111&cancelToken=' +
        'c'.repeat(43),
    );
    renderRecovery();
    await userEvent.click(screen.getByRole('link', { name: 'Start recovery' }));
    expect(screen.getByLabelText('Mobile number')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel this recovery request' })).toBeNull();
  });
  it('rejects a malformed fragment and never offers cancellation', () => {
    window.history.replaceState(null, '', '/security/recovery#recoveryId=bad&cancelToken=bad');
    renderRecovery();
    expect(screen.getByRole('alert').textContent).toContain('invalid');
    expect(screen.queryByRole('button', { name: 'Cancel this recovery request' })).toBeNull();
    expect(window.location.hash).toBe('');
  });
});
