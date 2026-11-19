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
  let winner: AttributionTouch | undefined;
  for (const touch of touches) {
    const time = touch.eligibleAt.getTime();
    if (time < start || time > end) continue;
    if (!winner || compareTouches(touch, winner) > 0) winner = touch;
  }
  return winner;
}

function compareTouches(left: AttributionTouch, right: AttributionTouch) {
  const leftTime = left.eligibleAt.getTime();
  const rightTime = right.eligibleAt.getTime();
  return (
    Math.floor(leftTime / MINUTE_MS) - Math.floor(rightTime / MINUTE_MS) ||
    Number(left.kind === 'tap') - Number(right.kind === 'tap') ||
    Number(left.sourceType === 'campaign') - Number(right.sourceType === 'campaign') ||
    leftTime - rightTime ||
    left.id.localeCompare(right.id)
  );
}
