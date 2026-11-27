import { z } from 'zod';

import { segmentListQuerySchema, type SegmentListQuery } from '@dakly/contracts/segments';

export const segmentsPageSize = 12;

// The list address carries the tab, search and page. `edit` and `view` open the builder, and keep
// the list address so Cancel returns to the same tab and page.
export type SegmentsView = Pick<SegmentListQuery, 'status' | 'search' | 'cursor'> & {
  edit?: string;
  view?: string;
};

const viewSchema = segmentListQuerySchema
  .pick({ status: true, search: true, cursor: true })
  .extend({
    edit: z.union([z.literal('new'), z.uuid()]).optional(),
    view: z.uuid().optional(),
  });

export function parseSegmentsView(
  raw: Record<string, string | undefined>,
): SegmentsView | undefined {
  const parsed = viewSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function segmentsHref(view: SegmentsView): string {
  const params = new URLSearchParams();
  if (view.status !== 'all') params.set('status', view.status);
  if (view.search) params.set('search', view.search);
  if (view.cursor) params.set('cursor', view.cursor);
  if (view.edit) params.set('edit', view.edit);
  if (view.view) params.set('view', view.view);
  const text = params.toString();
  return text ? `/segments?${text}` : '/segments';
}

// The list page a builder was opened from, without the builder itself.
export function listHref(view: SegmentsView): string {
  return segmentsHref({ ...view, edit: undefined, view: undefined });
}
