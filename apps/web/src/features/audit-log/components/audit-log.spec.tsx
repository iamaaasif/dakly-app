// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { actionLabel, actorLabel } from './audit-labels';
import { AuditLogScreen } from './audit-log-screen';
import { sessionContextKey } from '@/lib/session-context';

let before = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(before ? { before } : {}),
}));

function show(page: object) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    return Response.json(page, { headers: { 'x-session-context': 'verified' } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, { contextTag: 'verified', currentStore: {} });
  render(
    <QueryClientProvider client={client}>
      <AuditLogScreen />
    </QueryClientProvider>,
  );
  return urls;
}
afterEach(() => {
  cleanup();
  before = '';
  vi.unstubAllGlobals();
});

it('lists who changed what, with field names and a link to older rows', async () => {
  show({
    items: [
      {
        id: 'row-2',
        action: 'store.settings_changed',
        entityType: 'store',
        entityId: null,
        actor: { kind: 'user', isYou: true, role: 'owner' },
        changedFields: ['name', 'district'],
        reason: null,
        createdAt: '2026-11-20T10:00:00Z',
      },
      {
        id: 'row-1',
        action: 'order.refunded_partly',
        entityType: 'order',
        entityId: null,
        actor: { kind: 'user', isYou: false, role: 'admin' },
        changedFields: [],
        reason: 'Wrong size',
        createdAt: '2026-11-19T10:00:00Z',
      },
    ],
    nextCursor: 'row-1',
  });
  expect(await screen.findByText('Store settings changed')).toBeTruthy();
  expect(screen.getByText(/You \(Owner\)/)).toBeTruthy();
  expect(screen.getByText('Changed: name, district')).toBeTruthy();
  expect(screen.getByText('Order refunded partly')).toBeTruthy();
  expect(screen.getByText('Reason: Wrong size')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Older activity' }).getAttribute('href')).toBe(
    '/activity?before=row-1',
  );
  expect(screen.queryByRole('link', { name: 'Latest activity' })).toBeNull();
});

it('asks for the page named in the address and links back to the latest', async () => {
  before = 'row-1';
  const urls = show({ items: [], nextCursor: null });
  expect(await screen.findByText('No activity yet.')).toBeTruthy();
  expect(urls).toEqual(['/api/audit-log?before=row-1']);
  expect(screen.getByRole('link', { name: 'Latest activity' }).getAttribute('href')).toBe(
    '/activity',
  );
});

it('names every actor kind without a person', () => {
  expect(actorLabel({ kind: 'staff', isYou: false, role: null })).toBe('Dakly support');
  expect(actorLabel({ kind: 'user', isYou: false, role: null })).toBe('Former team member');
  expect(actorLabel({ kind: 'user', isYou: false, role: 'owner' })).toBe('Owner');
  expect(actionLabel('support.approved')).toBe('Support access approved');
});
