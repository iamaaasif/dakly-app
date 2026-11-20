import { describe, expect, it } from 'vitest';

import { selectAttributionTouch, type AttributionTouch } from './attribution-touch';

const orderAt = new Date('2026-11-19T06:00:00Z');
const workflowTap: AttributionTouch = {
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ad8',
  sourceType: 'automation',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007ad9',
  channel: 'whatsapp',
  eligibleAt: new Date('2026-11-15T06:00:00Z'),
};
const campaignTap: AttributionTouch = {
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ada',
  sourceType: 'campaign',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007adb',
  channel: 'sms',
  eligibleAt: new Date('2026-11-17T06:00:00Z'),
};

describe('selectAttributionTouch', () => {
  it('credits only the latest eligible touch before the order', () => {
    const afterOrder = { ...campaignTap, eligibleAt: new Date('2026-11-19T06:00:01Z') };
    expect(selectAttributionTouch([afterOrder, campaignTap, workflowTap], orderAt, 7)).toEqual(
      campaignTap,
    );
  });

  it('leaves an order uncredited when its only touch falls outside the window', () => {
    expect(selectAttributionTouch([workflowTap], orderAt, 3)).toBeUndefined();
  });

  it('credits the later tap', () => {
    const later = { ...workflowTap, eligibleAt: new Date('2026-11-17T06:00:01Z') };
    expect(selectAttributionTouch([campaignTap, later], orderAt, 7)).toEqual(later);
  });

  it('uses the later visit ID when taps have the same time', () => {
    const tied = {
      ...workflowTap,
      id: '019c01ea-cf15-7d31-a7f5-d73d66007adc',
      eligibleAt: campaignTap.eligibleAt,
    };
    expect(selectAttributionTouch([campaignTap, tied], orderAt, 7)).toEqual(tied);
  });
});
