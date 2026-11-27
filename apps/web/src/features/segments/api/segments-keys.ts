import type { SegmentRules } from '@dakly/contracts/segments';

export const segmentsKeys = {
  all: ['segments'] as const,
  list: (tag: string | undefined, view: { status: string; search?: string; cursor?: string }) =>
    ['segments', tag, 'list', view.status, view.search, view.cursor] as const,
  tabCounts: (tag: string | undefined) => ['segments', tag, 'tab-counts'] as const,
  count: (tag: string | undefined, rules?: SegmentRules) =>
    ['segments', tag, 'count', rules] as const,
};
