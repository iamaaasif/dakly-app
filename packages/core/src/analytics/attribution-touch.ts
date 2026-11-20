import { DAY_MS } from '../platform/time';

export type AttributionTouch = {
  id: string;
  sourceType: 'campaign' | 'automation';
  sourceId: string;
  channel: string;
  eligibleAt: Date;
};

export function selectAttributionTouch(
  touches: readonly AttributionTouch[],
  orderAt: Date,
  windowDays: 1 | 3 | 7,
): AttributionTouch | undefined {
  const end = orderAt.getTime();
  const start = end - windowDays * DAY_MS;
  return touches
    .filter(({ eligibleAt }) => eligibleAt.getTime() >= start && eligibleAt.getTime() <= end)
    .sort(
      (left, right) =>
        right.eligibleAt.getTime() - left.eligibleAt.getTime() || right.id.localeCompare(left.id),
    )[0];
}
