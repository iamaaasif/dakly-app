// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { OrderAreaFields } from './order-area-fields';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const area = (id: number, name: string, parentId: number | null) => ({
  id,
  name,
  nameBn: null,
  parentId,
  kind: 'area',
});
const areas: Record<string, unknown[]> = {
  '': [area(1, 'Dhaka', null)],
  '1': [area(10, 'Dhaka', 1), area(11, 'Gazipur', 1)],
  '10': [area(100, 'Savar', 10)],
  '11': [area(110, 'Kaliakair', 11)],
};

function Fields() {
  const form = useForm();
  return (
    <FormProvider {...form}>
      <OrderAreaFields onChange={() => undefined} />
    </FormProvider>
  );
}

function show() {
  vi.stubGlobal('fetch', async (path: string) => {
    const parent = new URL(path, 'http://shop.test').searchParams.get('parentId') ?? '';
    return Response.json({ items: areas[parent] ?? [], nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop' },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
  render(<Fields />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Order address picker', () => {
  it('offers Dhaka city next to the Dhaka suburbs, and the rest of any other district', async () => {
    show();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Dhaka' });
    await user.selectOptions(screen.getByLabelText('Division'), '1');
    await screen.findByRole('option', { name: 'Gazipur' });
    await user.selectOptions(screen.getByLabelText('District'), '10');
    const upazila = await screen.findByLabelText('Upazila');
    expect(upazila.textContent).toContain('Dhaka city');
    expect(upazila.textContent).toContain('Savar');
    await user.selectOptions(screen.getByLabelText('District'), '11');
    await screen.findByRole('option', { name: 'Kaliakair' });
    expect(screen.getByLabelText('Upazila').textContent).toContain('Rest of Gazipur');
  });
});
