import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Button } from './button';
import { ToastProvider, useToast } from './toast';

afterEach(cleanup);
// jsdom has no pointer capture, which the toast swipe handling reads on pointer up.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
});

function SaveButton() {
  const showToast = useToast();
  return <Button onClick={() => showToast('Customer saved')}>Save customer</Button>;
}

describe('ToastProvider', () => {
  it('shows a confirmation until it is dismissed', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Save customer' }));
    const region = screen.getByRole('region', { name: /Notifications/ });
    expect(within(region).getByText('Customer saved')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Customer saved')).toBeNull();
  });

  it('refuses to show a toast outside the provider', () => {
    expect(() => render(<SaveButton />)).toThrow('useToast needs a ToastProvider above it');
  });
});
