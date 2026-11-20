// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CampaignResponse } from '@dakly/contracts/campaigns';

import { CampaignResults } from './campaign-results';

afterEach(cleanup);

const sent: CampaignResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e70',
  name: 'Puja winback',
  goal: 'win_back',
  channel: 'sms',
  content: { text: 'Come back this week for our Puja collection.' },
  channelConnectionId: null,
  includeSegmentIds: [],
  excludeSegmentIds: [],
  source: null,
  scheduledFor: null,
  status: 'sent',
  approval: null,
  approvalFailureCode: null,
  startedAt: '2026-11-01T04:00:00Z',
  finishedAt: '2026-11-01T05:00:00Z',
  counts: {
    recipients: 1248,
    skipped: 12,
    sent: 1200,
    delivered: 1150,
    read: 0,
    tapped: 260,
    failed: 36,
    countedAt: '2026-11-01T05:01:00Z',
  },
  attribution: { orders: '12', revenuePoisha: '342800' },
  createdAt: '2026-10-30T04:00:00Z',
  updatedAt: '2026-11-01T05:00:00Z',
};

function card(label: string) {
  return within(screen.getByRole('region', { name: 'Campaign results' }))
    .getByText(label, { selector: 'dt' })
    .closest('div');
}

describe('Campaign results', () => {
  it('shows the counts and the attributed orders and revenue from the API', () => {
    render(<CampaignResults campaign={sent} />);
    expect(within(card('Sent')!).getByText('1,200')).toBeTruthy();
    expect(within(card('Delivered')!).getByText('1,150')).toBeTruthy();
    expect(within(card('Tapped link')!).getByText('260')).toBeTruthy();
    expect(within(card('Failed')!).getByText('36')).toBeTruthy();
    expect(within(card('Orders')!).getByText('12')).toBeTruthy();
    expect(within(card('Revenue')!).getByText('৳3,428')).toBeTruthy();
    expect(screen.getByText('1,248 customers, 12 skipped')).toBeTruthy();
    expect(screen.getByText('Come back this week for our Puja collection.')).toBeTruthy();
  });

  it('leaves out Read for SMS and shows it for WhatsApp', () => {
    const { rerender } = render(<CampaignResults campaign={sent} />);
    expect(screen.queryByText('Read', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Read', { selector: 'span' })).toBeNull();
    rerender(
      <CampaignResults
        campaign={{ ...sent, channel: 'whatsapp', counts: { ...sent.counts, read: 700 } }}
      />,
    );
    expect(within(card('Read')!).getByText('700')).toBeTruthy();
    expect(screen.getByText('Read', { selector: 'span' })).toBeTruthy();
  });

  it('says the counts are updating until the worker has counted them', () => {
    render(<CampaignResults campaign={{ ...sent, counts: { ...sent.counts, countedAt: null } }} />);
    expect(screen.getByRole('status').textContent).toBe('Counts are being updated.');
  });

  it('shows zero orders and revenue when the campaign has no attribution yet', () => {
    render(<CampaignResults campaign={{ ...sent, attribution: undefined }} />);
    expect(within(card('Orders')!).getByText('0')).toBeTruthy();
    expect(within(card('Revenue')!).getByText('৳0')).toBeTruthy();
  });
});
