// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createProductSchema, type ProductResponse } from '@dakly/contracts/products';
import type { SessionContext } from '@dakly/contracts/sessions';

import { useGetProduct } from '../api/get-product';
import { ProductPhotos } from './product-photos';
import { sessionContextKey } from '@/lib/session-context';

const productId = '019c01ea-cf15-7d31-a7f5-d73d66007ae2';
const firstId = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const secondId = '019c01ea-cf15-7d31-a7f5-d73d66007ae4';
const context: SessionContext = {
  user: { id: 'actor', name: 'Actor' },
  hasMemberships: true,
  contextTag: 'verified',
  currentStore: {
    storeId: 'shop',
    name: 'Shop',
    canViewProducts: true,
    canEditProducts: true,
    canViewOrders: false,
    canEditOrders: false,
    canViewCampaigns: false,
    canEditCampaigns: false,
    canViewAutomations: false,
    canEditAutomations: false,
    canViewCustomers: false,
    canCreateCustomer: false,
    canViewChats: false,
    canEditChats: false,
    canViewSegments: false,
    canEditSegments: false,
    canApproveSupport: false,
    canViewStoreSettings: false,
    canEditStoreSettings: false,
    canChangeExtensions: false,
    canViewTeam: false,
    canEditTeam: false,
    canTransferOwnership: false,
  },
};
const empty: ProductResponse = {
  ...createProductSchema.parse({ name: 'Silk scarf', pricePoisha: 45000 }),
  id: productId,
  variants: [],
  imageFileIds: [],
  photos: [],
  readiness: ['needs_photo'],
  createdAt: '2026-11-18T04:00:00Z',
  updatedAt: '2026-11-18T04:00:00Z',
};
const reply = (body: unknown) =>
  Response.json(body, { headers: { 'x-session-context': 'verified' } });
function PhotoHarness() {
  const product = useGetProduct(productId);
  return product.data ? <ProductPhotos product={product.data} /> : <p>Loading photos</p>;
}
function show(canEditProducts = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    ...context,
    currentStore: { ...context.currentStore!, canEditProducts },
  });
  render(
    <QueryClientProvider client={client}>
      <PhotoHarness />
    </QueryClientProvider>,
  );
  return client;
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Product photos', () => {
  it('confirms a photo after a successful signed PUT and refreshes the visible photo', async () => {
    let current = empty;
    let uploaded = false;
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (path.endsWith('/upload-url')) {
        expect(JSON.parse(String(init.body))).toEqual({ contentType: 'image/png', sizeBytes: 3 });
        return reply({ fileId: firstId, uploadUrl: 'https://uploads.example.test/photo' });
      }
      if (path.startsWith('https://uploads.')) {
        expect(init.method).toBe('PUT');
        expect(init.credentials).toBe('omit');
        expect(new Headers(init.headers).get('Content-Type')).toBe('image/png');
        uploaded = true;
        return new Response(null, { status: 200 });
      }
      if (path.endsWith('/confirm')) {
        expect(uploaded).toBe(true);
        expect(JSON.parse(String(init.body))).toEqual({
          fileId: firstId,
          contentType: 'image/png',
          sizeBytes: 3,
        });
        current = { ...empty, photos: [{ id: firstId, url: 'https://images.example.test/scarf' }] };
      }
      return reply(current);
    });
    show();
    await userEvent.upload(
      await screen.findByLabelText('Add photo'),
      new File(['png'], 'scarf.png', { type: 'image/png' }),
    );
    expect(await screen.findByAltText('Silk scarf photo 1')).toBeTruthy();
  });

  it('shows photos to a viewer without write controls', async () => {
    vi.stubGlobal('fetch', async () =>
      reply({
        ...empty,
        photos: [{ id: firstId, url: 'https://images.example.test/scarf' }],
      }),
    );
    show(false);
    expect(await screen.findByAltText('Silk scarf photo 1')).toBeTruthy();
    expect(screen.queryByLabelText('Add photo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove photo 1' })).toBeNull();
  });

  it('rejects a file type outside the photo contract before asking for an upload URL', async () => {
    let requestedUpload = false;
    vi.stubGlobal('fetch', async (path: string) => {
      if (path.endsWith('/upload-url')) requestedUpload = true;
      return reply(empty);
    });
    show();
    await userEvent
      .setup({ applyAccept: false })
      .upload(
        await screen.findByLabelText('Add photo'),
        new File(['pdf'], 'scarf.pdf', { type: 'application/pdf' }),
      );
    expect((await screen.findByRole('alert')).textContent).toContain('JPEG, PNG or WebP');
    expect(requestedUpload).toBe(false);
  });

  it('does not confirm a rejected upload and keeps the error visible', async () => {
    let confirmed = false;
    vi.stubGlobal('fetch', async (path: string) => {
      if (path.endsWith('/upload-url'))
        return reply({ fileId: firstId, uploadUrl: 'https://uploads.example.test/photo' });
      if (path.startsWith('https://uploads.')) return new Response(null, { status: 503 });
      if (path.endsWith('/confirm')) confirmed = true;
      return reply(empty);
    });
    show();
    await userEvent.upload(
      await screen.findByLabelText('Add photo'),
      new File(['png'], 'scarf.png', { type: 'image/png' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('upload');
    expect(confirmed).toBe(false);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reorders saved photos and requires confirmation before removing one', async () => {
    const first = { id: firstId, url: 'https://images.example.test/first' };
    const second = { id: secondId, url: 'https://images.example.test/second' };
    let current = { ...empty, photos: [first, second] };
    let removed = false;
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) => {
      if (init.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ fileIds: [secondId, firstId] });
        current = { ...current, photos: [second, first] };
      }
      if (init.method === 'DELETE') {
        removed = true;
        current = { ...current, photos: [first] };
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return reply(current);
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Move photo 2 earlier' }));
    await waitFor(() =>
      expect(screen.getByAltText('Silk scarf photo 1').getAttribute('src')).toBe(second.url),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(screen.getByRole('dialog').textContent).toContain('Silk scarf');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(removed).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove photo' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(removed).toBe(true);
  });

  it('shows a reorder failure after a failed upload', async () => {
    const current = {
      ...empty,
      photos: [
        { id: firstId, url: 'https://images.example.test/first' },
        { id: secondId, url: 'https://images.example.test/second' },
      ],
    };
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (path.endsWith('/upload-url') || init.method === 'PATCH')
        return Response.json(
          {
            error: {
              code: 'REQUEST_FAILED',
              message: init.method === 'PATCH' ? 'Could not move photo' : 'Could not add photo',
            },
          },
          { status: 503, headers: { 'x-session-context': 'verified' } },
        );
      return reply(current);
    });
    show();
    await userEvent.upload(
      await screen.findByLabelText('Add photo'),
      new File(['png'], 'scarf.png', { type: 'image/png' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Could not add photo');
    await userEvent.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }));
    await screen.findByText('Could not move photo');
  });

  it('keeps a rejected removal and its error inside the confirmation dialog', async () => {
    const current = {
      ...empty,
      photos: [{ id: firstId, url: 'https://images.example.test/first' }],
    };
    let finish: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal('fetch', async (_path: string, init: RequestInit) =>
      init.method === 'DELETE' ? pending : reply(current),
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo 1' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }));
    const cancel = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Cancel' });
    const close = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Close dialog' });
    expect(cancel.disabled).toBe(true);
    expect(close.disabled).toBe(true);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    finish(
      Response.json(
        { error: { code: 'REQUEST_FAILED', message: 'Please retry removing the photo' } },
        { status: 503, headers: { 'x-session-context': 'verified' } },
      ),
    );
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Please retry');
    expect(cancel.disabled).toBe(false);
    expect(close.disabled).toBe(false);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('keeps the original context when a shop changes during upload', async () => {
    let finishUpload: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      finishUpload = resolve;
    });
    let confirmingContext = '';
    let inUpload = false;
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      if (path.endsWith('/upload-url'))
        return reply({ fileId: firstId, uploadUrl: 'https://uploads.example.test/photo' });
      if (path.startsWith('https://uploads.')) {
        inUpload = true;
        return pending;
      }
      if (path.endsWith('/confirm')) {
        confirmingContext = new Headers(init.headers).get('X-Session-Context')!;
        return Response.json(
          { error: { code: 'SESSION_CONTEXT_CHANGED', message: 'Your shop changed' } },
          { status: 409 },
        );
      }
      if (new Headers(init.headers).get('X-Session-Context') === 'next')
        return Response.json(
          { error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } },
          { status: 404 },
        );
      return reply(empty);
    });
    const client = show();
    await userEvent.upload(
      await screen.findByLabelText('Add photo'),
      new File(['png'], 'scarf.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(inUpload).toBe(true));
    client.setQueryData(sessionContextKey, {
      ...context,
      contextTag: 'next',
      currentStore: { ...context.currentStore!, storeId: 'next-shop' },
    });
    await screen.findByText('Loading photos');
    finishUpload(new Response(null, { status: 200 }));
    await waitFor(() => expect(confirmingContext).toBe('verified'));
    expect(screen.queryByRole('img')).toBeNull();
  });
});
