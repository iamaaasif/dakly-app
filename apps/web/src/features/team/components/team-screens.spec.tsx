// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SessionContext } from '@dakly/contracts/sessions';
import { MembersScreen } from './members-screen';
import { RolesScreen } from './roles-screen';
import { RoleForm } from './role-form';
import { RolePicker } from './role-picker';
import { TransferRequest } from './transfer-request';
import { sessionContextKey } from '@/lib/session-context';

const permissions = { areas: {}, seeFullPhone: false, exportLists: false, refund: false };
function show(child: ReactNode, edit = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'actor', name: 'Actor' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewTeam: true,
      canEditTeam: edit,
      canViewCustomers: false,
      canCreateCustomer: false,
      canApproveSupport: false,
      canTransferOwnership: false,
      canViewStoreSettings: false,
      canEditStoreSettings: false,
      canChangeExtensions: false,
    },
    contextTag: 'verified',
    stores: [{ storeId: 'shop', name: 'Shop' }],
  };
  client.setQueryData(sessionContextKey, context);
  return render(child, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
const response = (body: unknown) =>
  Response.json(body, { headers: { 'x-session-context': 'verified' } });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Team screens', () => {
  it('shows masked contact, exact activity and plan seats without granting edit controls', async () => {
    vi.stubGlobal('fetch', async () =>
      response({
        seats: { used: 1, limit: 1 },
        items: [
          {
            id: 'member',
            userId: 'actor',
            roleId: null,
            name: 'Rina',
            phone: '017XXXXX678',
            email: null,
            builtInRole: 'owner',
            status: 'active',
            lastActiveAt: '2026-01-10T09:30:00Z',
            inviteExpiresAt: null,
          },
        ],
        nextCursor: null,
      }),
    );
    show(<MembersScreen />);
    await screen.findByRole('heading', { name: 'Rina' });
    expect(screen.getByText('017XX-XXX678')).toBeTruthy();
    expect(screen.getByText('10 Jan 2026, 15:30 (Asia/Dhaka)')).toBeTruthy();
    expect(screen.getByRole('meter').getAttribute('value')).toBe('1');
    expect(screen.queryByRole('button', { name: 'Invite member' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove member' })).toBeNull();
  });
  it('keeps built-in roles read-only and carries the custom-role cursor in the URL', async () => {
    vi.stubGlobal('fetch', async () =>
      response({
        items: [],
        builtInRoles: [{ builtInRole: 'owner', permissions }],
        nextCursor: 'next-role',
      }),
    );
    show(<RolesScreen />);
    await screen.findByRole('heading', { name: 'Owner' });
    expect(screen.getByText('Built-in roles are read-only.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/team?tab=roles&cursor=next-role',
    );
    expect(screen.queryByRole('button', { name: 'Edit role' })).toBeNull();
  });
  it('sends complete custom permissions with the context tag and maps name field errors', async () => {
    let body: Record<string, unknown> | undefined;
    let headers: HeadersInit | undefined;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      headers = init.headers;
      return Response.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Check name',
            fields: [{ path: 'name', message: 'Choose another name' }],
          },
        },
        { status: 400 },
      );
    });
    show(<RoleForm onDone={() => undefined} />, true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Role name'), 'Reader');
    await user.selectOptions(screen.getByLabelText('Team', { exact: true }), 'view');
    await user.click(screen.getByLabelText('See full phone numbers'));
    expect(
      within(screen.getByLabelText('Billing')).queryByRole('option', { name: 'Edit' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save role' }));
    await screen.findByText('Choose another name');
    expect(screen.getByLabelText('Role name').getAttribute('aria-invalid')).toBe('true');
    expect(headers).toMatchObject({ 'X-Session-Context': 'verified' });
    expect(body).toMatchObject({
      name: 'Reader',
      permissions: {
        areas: { team: 'view', billing: 'none' },
        seeFullPhone: true,
        exportLists: false,
        refund: false,
      },
    });
  });
  it('shows a retry when the members request fails', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'FAILED', message: 'Try again' } }, { status: 503 }),
    );
    show(<MembersScreen />);
    await screen.findByRole('button', { name: 'Retry members' });
    expect(screen.getByRole('alert').textContent).toContain('Try again');
  });
});

describe('Member role selection', () => {
  it('preserves a current role beyond the first page and loads further options only on request', async () => {
    const pages: string[] = [];
    vi.stubGlobal('fetch', async (path: string) => {
      pages.push(path);
      return response(
        path.includes('cursor=next-page')
          ? {
              items: [{ id: 'current-role', name: 'Current custom role name', permissions }],
              builtInRoles: [],
              nextCursor: null,
            }
          : {
              items: [{ id: 'first-role', name: 'First role', permissions }],
              builtInRoles: [],
              nextCursor: 'next-page',
            },
      );
    });
    show(<RolePicker value={{ roleId: 'current-role' }} onChange={() => undefined} />);
    const select = await screen.findByRole('combobox', { name: 'Role' });
    expect((select as HTMLSelectElement).value).toBe('current-role');
    expect(pages).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Load more roles' }));
    await screen.findByRole('option', { name: 'Current custom role name' });
    expect((select as HTMLSelectElement).value).toBe('current-role');
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain('cursor=next-page');
  });
});

describe('Role permission errors', () => {
  it('associates a server area error with the permission selector', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Check permissions',
            fields: [
              { path: 'permissions.areas.team', message: 'Choose a lower Team access level' },
            ],
          },
        },
        { status: 400 },
      ),
    );
    show(<RoleForm onDone={() => undefined} />, true);
    await userEvent.type(screen.getByLabelText('Role name'), 'Reader');
    await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
    await screen.findByText('Check permissions');
    expect(screen.getByLabelText('Team', { exact: true }).getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.getByText('Choose a lower Team access level')).toBeTruthy();
  });
});

describe('Ownership recipient pages', () => {
  it('does not send a code to a selection from the previous page', async () => {
    const firstId = '11111111-1111-4111-8111-111111111111';
    const secondId = '22222222-2222-4222-8222-222222222222';
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (init.body) {
        sent.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      const later = path.includes('cursor=');
      return response({
        items: [
          {
            id: later ? secondId : firstId,
            userId: later ? 'second' : 'first',
            name: later ? 'Sumi' : 'Rina',
            phone: null,
            email: null,
            builtInRole: 'support_agent',
            roleId: null,
            status: 'active',
            inviteExpiresAt: null,
            lastActiveAt: null,
          },
        ],
        seats: { used: 3, limit: 5 },
        nextCursor: later ? null : firstId,
      });
    });
    const view = show(<TransferRequest />);
    await screen.findByRole('option', { name: 'Rina' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'New Owner' }), firstId);
    view.rerender(<TransferRequest cursor={firstId} />);
    await screen.findByRole('option', { name: 'Sumi' });
    await userEvent.click(screen.getByRole('button', { name: 'Send ownership code' }));
    expect(sent).toHaveLength(0);
  });
});
