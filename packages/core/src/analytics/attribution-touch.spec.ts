import { describe, expect, it } from 'vitest';

import { selectAttributionTouch, type AttributionTouch } from './attribution-touch';

const orderAt = new Date('2026-11-19T06:00:00Z');
const workflowRead: AttributionTouch = {
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ad8',
  sourceType: 'automation',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007ad9',
  channel: 'whatsapp',
  kind: 'read',
  eligibleAt: new Date('2026-11-15T06:00:00Z'),
};
const campaignTap: AttributionTouch = {
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ada',
  sourceType: 'campaign',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007adb',
  channel: 'sms',
  kind: 'tap',
  eligibleAt: new Date('2026-11-17T06:00:00Z'),
};

describe('selectAttributionTouch', () => {
  it('credits only the latest eligible touch before the order', () => {
    const afterOrder = { ...campaignTap, eligibleAt: new Date('2026-11-19T06:00:01Z') };
    expect(selectAttributionTouch([afterOrder, campaignTap, workflowRead], orderAt, 7)).toEqual(
      campaignTap,
    );
  });

  it('leaves an order uncredited when its only touch falls outside the window', () => {
    expect(selectAttributionTouch([workflowRead], orderAt, 3)).toBeUndefined();
  });

  it('prefers a tap to a later read in the same minute', () => {
    const tap = { ...campaignTap, sourceType: 'automation' as const };
    const read = {
      ...workflowRead,
      sourceType: 'campaign' as const,
      eligibleAt: new Date('2026-11-17T06:00:59Z'),
    };
    expect(selectAttributionTouch([tap, read], orderAt, 7)).toEqual(tap);
  });

  it.each([
    { kind: 'delivery', sourceType: 'campaign', channel: 'sms' },
    { kind: 'chat', sourceType: 'post', channel: 'facebook' },
  ] as const)('uses the later $kind when a tap falls in the same minute', (source) => {
    const later = {
      ...campaignTap,
      id: workflowRead.id,
      ...source,
      eligibleAt: new Date('2026-11-17T06:00:59Z'),
    };
    expect(selectAttributionTouch([campaignTap, later], orderAt, 7)).toEqual(later);
  });

  it('prefers the campaign when the eligibility time and kind are tied', () => {
    const workflowTap = { ...campaignTap, id: workflowRead.id, sourceType: 'automation' as const };
    expect(selectAttributionTouch([workflowTap, campaignTap], orderAt, 7)).toEqual(campaignTap);
  });
});
