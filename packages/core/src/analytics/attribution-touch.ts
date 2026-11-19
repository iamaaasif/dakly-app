import type { attributionSourceTypes } from '@dakly/contracts/orders';

import { DAY_MS, MINUTE_MS } from '../platform/time';

export type AttributionTouch = {
  id: string;
  sourceType: (typeof attributionSourceTypes)[number];
  sourceId: string;
  channel: string;
  kind: 'delivery' | 'read' | 'tap' | 'chat';
  eligibleAt: Date;
};

export type AttributionWindow = 1 | 3 | 7;

export function selectAttributionTouch(
  touches: readonly AttributionTouch[],
  orderAt: Date,
  windowDays: AttributionWindow,
): AttributionTouch | undefined {
  const end = orderAt.getTime();
  const start = end - windowDays * DAY_MS;
  const eligible = touches.filter(({ eligibleAt }) => {
    const time = eligibleAt.getTime();
    return time >= start && time <= end;
  });
  const tappedMinutes = new Set(eligible.filter(({ kind }) => kind === 'tap').map(touchMinute));
  // Only a read loses to an earlier tap in the same minute.
  const candidates = eligible.filter(
    (touch) => touch.kind !== 'read' || !tappedMinutes.has(touchMinute(touch)),
  );
  const latest = candidates.reduce(
    (time, touch) => Math.max(time, touch.eligibleAt.getTime()),
    Number.NEGATIVE_INFINITY,
  );
  const tied = candidates.filter((touch) => touch.eligibleAt.getTime() === latest);
  const hasCampaign = tied.some(({ sourceType }) => sourceType === 'campaign');
  return tied
    .filter(({ sourceType }) => !hasCampaign || sourceType !== 'automation')
    .sort((left, right) => left.id.localeCompare(right.id))
    .at(-1);
}

function touchMinute(touch: AttributionTouch) {
  return Math.floor(touch.eligibleAt.getTime() / MINUTE_MS);
}
