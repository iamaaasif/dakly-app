import type { SegmentRules } from '@dakly/contracts/segments';

export const segmentsKeys = {
  all: ['segments'] as const,
  list: (tag: string | undefined, cursor?: string) => ['segments', tag, 'list', cursor] as const,
  count: (tag: string | undefined, rules?: SegmentRules) =>
    ['segments', tag, 'count', rules] as const,
};
