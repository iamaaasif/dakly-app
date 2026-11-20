import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';

afterEach(cleanup);

describe('Switch', () => {
  it('renders switch with role and aria-checked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} aria-label="Toggle setting" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole('switch', { name: 'Toggle setting' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('toggles from checked to unchecked on click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch checked={true} aria-label="Toggle setting" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole('switch', { name: 'Toggle setting' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
