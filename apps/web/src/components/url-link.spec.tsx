// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { UrlLink } from './url-link';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

it('changes the address in the browser on a plain click', () => {
  render(<UrlLink href="/orders?stage=shipped">Shipped</UrlLink>);
  fireEvent.click(screen.getByRole('link', { name: 'Shipped' }));
  expect(window.location.pathname + window.location.search).toBe('/orders?stage=shipped');
});

it('leaves a modified click to the browser', () => {
  render(<UrlLink href="/orders?stage=shipped">Shipped</UrlLink>);
  fireEvent.click(screen.getByRole('link', { name: 'Shipped' }), { ctrlKey: true });
  expect(window.location.pathname).toBe('/');
});
