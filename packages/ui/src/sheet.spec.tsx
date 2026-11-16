import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './button';
import { Sheet } from './sheet';

afterEach(cleanup);

function CustomerPanel() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open customer</Button>
      <Sheet title="Rahima Akter" open={isOpen} onClose={() => setIsOpen(false)}>
        <Button>Add a note</Button>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('opens as a named dialog and returns focus to the trigger when closed', async () => {
    const user = userEvent.setup();
    render(<CustomerPanel />);
    const trigger = screen.getByRole('button', { name: 'Open customer' });
    await user.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'Rahima Akter' });
    expect(sheet.contains(document.activeElement)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<CustomerPanel />);
    await user.click(screen.getByRole('button', { name: 'Open customer' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
