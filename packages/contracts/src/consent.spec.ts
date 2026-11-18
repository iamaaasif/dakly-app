import { describe, expect, it } from 'vitest';

import { recordConsentSchema } from './contacts';
import { consentChangedEventSchema } from './events/contacts';

const id = '019b1234-1234-7123-8123-123456789abc';

describe('consent contracts', () => {
  it('accepts import undo as an unanswered consent event', () => {
    const event = {
      type: 'consent.changed',
      storeId: id,
      occurredAt: '2026-11-18T04:30:00.000Z',
      payload: {
        consentId: id,
        contactId: id,
        channel: 'sms',
        status: 'not_answered',
        source: 'import',
      },
    };
    expect(consentChangedEventSchema.parse(event)).toEqual(event);
  });

  it('does not let a staff answer erase a previous refusal', () => {
    expect(
      recordConsentSchema.safeParse({
        channel: 'sms',
        status: 'not_answered',
        note: 'ফোনে উত্তর দিয়েছেন',
      }).success,
    ).toBe(false);
  });

  it.each(['granted', 'withdrawn'])('continues to accept a staff %s answer', (status) => {
    const answer = { channel: 'sms', status, note: 'ফোনে উত্তর দিয়েছেন' };
    expect(recordConsentSchema.parse(answer)).toEqual(answer);
  });
});
