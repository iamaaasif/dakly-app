import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

function OrderTabs() {
  return (
    <Tabs defaultValue="details">
      <TabsList aria-label="Order">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="details">Delivery to Mirpur</TabsContent>
      <TabsContent value="history">Confirmed by phone</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the panel of the tab picked by click', async () => {
    const user = userEvent.setup();
    render(<OrderTabs />);
    expect(screen.getByRole('tabpanel').textContent).toBe('Delivery to Mirpur');
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('tab', { name: 'History' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'History' }).textContent).toBe(
      'Confirmed by phone',
    );
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<OrderTabs />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Details' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Confirmed by phone');
  });
});
