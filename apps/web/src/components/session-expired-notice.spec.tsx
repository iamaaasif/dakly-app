// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SessionExpiredNotice } from './session-expired-notice';

describe('SessionExpiredNotice', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('links to sign-in that returns to the current page, in a new tab', () => {
    window.history.replaceState(null, '', '/orders?status=pending');
    render(<SessionExpiredNotice />);
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/sign-in?next=%2Forders%3Fstatus%3Dpending');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('alert').textContent).toContain('session has expired');
  });
});
