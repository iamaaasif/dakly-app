import { describe, expect, it } from 'vitest';

import { formatHandoverSummary } from './handover-summary';

describe('formatHandoverSummary', () => {
  it('uses the model-supplied summary when present', () => {
    expect(
      formatHandoverSummary({
        reason: 'complaint',
        summary: 'Reason: complaint | Customer: Adam | Issue: torn kurti',
        latestText: 'ignored',
      }),
    ).toBe('Reason: complaint | Customer: Adam | Issue: torn kurti');
  });

  it('extracts customer name, phone, and order id when falling back to latest text', () => {
    expect(
      formatHandoverSummary({
        reason: 'complaint',
        latestText: 'amar nam Adam, phone 01712345678, order 1042, kurti torn ashche',
      }),
    ).toBe(
      'Reason: complaint | Customer: Adam | Phone: 01712345678 | Order: #1042 | Issue: amar nam Adam, phone 01712345678, order 1042, kurti torn ashche',
    );
  });

  it('normalizes Bangla digits in phone and order numbers', () => {
    expect(
      formatHandoverSummary({
        reason: 'refund',
        latestText: 'আমার নাম করিম, ফোন ০১৭১২৩৪৫৬৭৮, অর্ডার ১০৪২, টাকা ফেরত চাই',
      }),
    ).toBe(
      'Reason: refund | Customer: করিম | Phone: 01712345678 | Order: #1042 | Issue: আমার নাম করিম, ফোন ০১৭১২৩৪৫৬৭৮, অর্ডার ১০৪২, টাকা ফেরত চাই',
    );
  });

  it('does not read a plain word after "order" as an order number', () => {
    expect(
      formatHandoverSummary({ reason: 'asked_for_person', latestText: 'order korte chai' }),
    ).toBe('Reason: asked_for_person | Issue: order korte chai');
    expect(
      formatHandoverSummary({ reason: 'asked_for_person', latestText: 'অর্ডার করতে চাই' }),
    ).toBe('Reason: asked_for_person | Issue: অর্ডার করতে চাই');
  });
});
