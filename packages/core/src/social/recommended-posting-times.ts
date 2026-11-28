import type { PostingSlot, RecommendedPostingSlots } from '@dakly/contracts/social';

import { recommendedPostingSlots } from './next-posting-slot';

// Fewer orders than this say too little about when customers are online.
const minimumOrders = 20;
// Two posts a day should not land in the same busy stretch.
const minimumHoursApart = 3;

function hoursApart(first: number, second: number) {
  const gap = Math.abs(first - second);
  return Math.min(gap, 24 - gap);
}

export function recommendPostingSlots(
  hourCounts: { hour: number; orders: number }[],
): RecommendedPostingSlots {
  const total = hourCounts.reduce((sum, { orders }) => sum + orders, 0);
  const busiest = [...hourCounts].sort((a, b) => b.orders - a.orders || a.hour - b.hour);
  const [first] = busiest;
  if (!first || total < minimumOrders) return { slots: recommendedPostingSlots, basis: 'default' };
  const second = busiest.find(({ hour }) => hoursApart(hour, first.hour) >= minimumHoursApart);
  const hours = [first.hour, ...(second ? [second.hour] : [])].sort((a, b) => a - b);
  const slots: PostingSlot[] = Array.from({ length: 7 }, (_, weekday) =>
    hours.map((hour) => ({ weekday, time: `${String(hour).padStart(2, '0')}:00` })),
  ).flat();
  return { slots, basis: 'orders' };
}
