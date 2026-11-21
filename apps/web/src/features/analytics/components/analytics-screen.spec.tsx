// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { replace, show } from './analytics-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('Analytics screen', () => {
  it('shows the headline, return per ৳1 and the funnel from the report', async () => {
    show();
    expect(await screen.findByText('from 277 orders in the last 30 days')).toBeTruthy();
    expect(screen.getByText('came back for every ৳1 you spent on messages')).toBeTruthy();
    expect(screen.getByText(/You spent ৳8,739 on messages \(WhatsApp, SMS\)/)).toBeTruthy();
    const funnel = screen.getByRole('heading', { name: 'From message to order' }).closest('div')!;
    expect(within(funnel).getByText('Read (not SMS)')).toBeTruthy();
    expect(within(funnel).getByText('277')).toBeTruthy();
  });

  it('hides the comparison when Compare with before is off', async () => {
    show({ compare: false });
    await screen.findByText('from 277 orders in the last 30 days');
    expect(screen.queryByText(/vs the 30 days before/)).toBeNull();
    expect(screen.queryByText('Up 23%')).toBeNull();
  });

  it('shows the change from the period before when Compare is on', async () => {
    show();
    expect(await screen.findByText(/vs the 30 days before/)).toBeTruthy();
    expect(screen.getAllByText('Up 23%').length).toBeGreaterThan(0);
  });

  it('keeps the toggle in the URL', async () => {
    show();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Compare with before' }));
    expect(replace).toHaveBeenCalledWith('/analytics?tab=overview&period=30&compare=off');
  });

  it('hides a channel from the chart when its chip is tapped', async () => {
    show();
    const chip = await screen.findByRole('button', { name: /SMS/ });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the Best cards, with a second line when another channel earned more money', async () => {
    show();
    const cards = await screen.findByRole('region', { name: 'What worked best' });
    expect(within(cards).getByText('Puja winback')).toBeTruthy();
    expect(within(cards).getByText('৳204 back for every ৳1')).toBeTruthy();
    expect(within(cards).getByText('৳94 per ৳1')).toBeTruthy();
    expect(within(cards).getByText(/WhatsApp earned the most money: ৳3,45,750/)).toBeTruthy();
    expect(within(cards).getByText(/Turn on an automation/)).toBeTruthy();
  });

  it('lists campaigns by money earned and opens a campaign from its row', async () => {
    show({ tab: 'campaigns' });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    const names = within(table)
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => text?.includes('Puja') || text?.includes('Kurti'));
    expect(names).toEqual(['New Kurti collection', 'Puja winback']);
    expect(within(table).getByRole('link', { name: 'Puja winback' }).getAttribute('href')).toBe(
      '/campaigns/c1',
    );
    expect(within(table).getByText('৳204')).toBeTruthy();
    expect(screen.getByText('2 campaigns · ৳2,99,300 earned')).toBeTruthy();
  });

  it('filters campaigns by the search and channel in the URL', async () => {
    show({ tab: 'campaigns', search: 'puja', channel: 'sms' });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    expect(within(table).queryByText('New Kurti collection')).toBeNull();
    expect(within(table).getByText('Puja winback')).toBeTruthy();
    expect(screen.getByText('1 campaign · ৳1,12,400 earned')).toBeTruthy();
  });

  it('keeps the sort in the URL', async () => {
    show({ tab: 'campaigns' });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    expect(within(table).getByRole('link', { name: 'Sort by Orders' }).getAttribute('href')).toBe(
      '/analytics?tab=campaigns&period=30&sort=orders',
    );
  });

  it('shows what each automation earned and how many customers ordered', async () => {
    show({ tab: 'automations' });
    const list = await screen.findByRole('list', { name: 'Automations' });
    expect(within(list).getByText('Welcome new subscribers')).toBeTruthy();
    expect(
      within(list).getByText('WhatsApp · 12,642 customers went through it · 6.8% ordered'),
    ).toBeTruthy();
    expect(within(list).getByText('861 orders')).toBeTruthy();
    expect(screen.getByText('Earned on autopilot')).toBeTruthy();
  });

  it('compares what each channel costs and earns, and says SMS reads cannot be tracked', async () => {
    show({ tab: 'channels' });
    const whatsapp = (await screen.findByRole('heading', { name: 'WhatsApp' })).closest('div')!
      .parentElement!.parentElement!;
    expect(within(whatsapp).getByText('66% of your marketing money')).toBeTruthy();
    expect(within(whatsapp).getByText('৳16,62,825')).toBeTruthy();
    expect(within(whatsapp).getByText('1,497 orders')).toBeTruthy();
    expect(within(whatsapp).getByText('৳25')).toBeTruthy();
    expect(within(whatsapp).getByText('45,130 messages')).toBeTruthy();
    expect(within(whatsapp).getByText('78%')).toBeTruthy();
    expect(within(whatsapp).getByText('৳0.95')).toBeTruthy();
    expect(screen.getByText('Can’t be tracked')).toBeTruthy();
    expect(screen.getByText('No money from marketing yet')).toBeTruthy();
  });

  it('shows social posts with no money or taps, because Dakly links in posts are not tracked', async () => {
    show({ tab: 'channels' });
    expect(await screen.findByText('10,330 people reached')).toBeTruthy();
    expect(screen.getByText('Dakly links in posts are not tracked yet')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('ranks posts by reach and shows where and when each was published', async () => {
    show({ tab: 'social' });
    const list = await screen.findByRole('list', { name: 'Social posts' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]!.textContent).toContain('Thank you for 18,000 followers.');
    expect(within(rows[0]!).getByText('Facebook · Oct 30')).toBeTruthy();
    expect(within(rows[1]!).getByText('Facebook + Instagram · Nov 2')).toBeTruthy();
    expect(within(rows[0]!).getByText('6,120')).toBeTruthy();
    expect(screen.getByText('10,330 people reached · 540 reactions')).toBeTruthy();
    expect(screen.getByText(/update these numbers for up to 2 days/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all posts' }).getAttribute('href')).toBe(
      '/social/posts',
    );
  });

  it('shows what the AI agent did, how chats ended and why they were handed over', async () => {
    show({ tab: 'ai-agent' });
    const figures = await screen.findByRole('list', { name: 'Key figures' });
    expect(within(figures).getByText('412')).toBeTruthy();
    expect(within(figures).getByText('78.2%')).toBeTruthy();
    expect(within(figures).getByText(/27 replied in the last day are left out/)).toBeTruthy();
    expect(within(figures).getByText('৳1,842.50')).toBeTruthy();
    expect(within(figures).getByText('৳81,250 in orders the AI placed.')).toBeTruthy();
    const reasons = screen
      .getByRole('heading', { name: 'Why chats were handed over' })
      .closest('div')!;
    expect(within(reasons).getByText('Asked for a discount')).toBeTruthy();
    expect(within(reasons).getByText('Refund or exchange')).toBeTruthy();
  });
});
