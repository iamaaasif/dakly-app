// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { ExportProductsButtons } from './export-products-buttons';
import { sessionContextKey } from '@/lib/session-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(query: { search?: string; readiness?: 'hidden'; limit: number }) {
  const client = new QueryClient();
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { storeId: 'shop' },
  } as SessionContext);
  render(
    <QueryClientProvider client={client}>
      <ExportProductsButtons query={query} />
    </QueryClientProvider>,
  );
}

describe('export products buttons', () => {
  it.each([
    ['Export to Excel', 'xlsx'],
    ['Export to CSV', 'csv'],
  ])('%s asks for the file in that format with the screen filters', async (name, format) => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (path: string) => {
      urls.push(path);
      return new Response('file', {
        headers: {
          'x-session-context': 'verified',
          'content-disposition': `attachment; filename="dakly-products.${format}"`,
          'x-row-count': '1204',
        },
      });
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
    );
    show({ limit: 50, search: 'kurti', readiness: 'hidden' });
    await userEvent.setup().click(screen.getByRole('button', { name }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Exported 1,204 rows. Check your downloads in a moment.',
    );
    expect(urls).toEqual([`/api/products/export?search=kurti&readiness=hidden&format=${format}`]);
  });

  it('says when the file could not be downloaded', async () => {
    vi.stubGlobal('fetch', async () => new Response('no', { status: 500 }));
    show({ limit: 50 });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export to CSV' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/./);
  });
});
