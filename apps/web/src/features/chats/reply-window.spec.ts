import { describe, expect, it } from 'vitest';

import { replyWindow } from './reply-window';

const now = Date.parse('2026-11-22T10:00:00Z');
const hoursFromNow = (hours: number) => new Date(now + hours * 3_600_000).toISOString();

describe('reply window', () => {
  it('counts the hours left in the 24-hour window', () => {
    expect(replyWindow({ channel: 'messenger', windowExpiresAt: hoursFromNow(22.5) }, now)).toEqual(
      {
        state: 'open',
        label: 'Reply within 23 h',
      },
    );
  });

  it('allows a reply for seven days after the customer last wrote', () => {
    expect(
      replyWindow({ channel: 'instagram', windowExpiresAt: hoursFromNow(-30) }, now).state,
    ).toBe('human-agent');
    expect(
      replyWindow({ channel: 'instagram', windowExpiresAt: hoursFromNow(-24 * 6 - 1) }, now).state,
    ).toBe('closed');
  });

  it('closes a chat that never had a customer message and does not send to WhatsApp', () => {
    expect(replyWindow({ channel: 'messenger', windowExpiresAt: null }, now).state).toBe('closed');
    expect(replyWindow({ channel: 'whatsapp', windowExpiresAt: hoursFromNow(5) }, now).state).toBe(
      'unsupported',
    );
  });
});
