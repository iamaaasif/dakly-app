'use client';
import { Pencil } from 'lucide-react';
import Link from 'next/link';

import type { SegmentListItem } from '@dakly/contracts/segments';
import { Badge } from '@dakly/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { segmentsHref, type SegmentsView } from '../segments-view';
import { SegmentActionsMenu } from './segment-actions-menu';
import { formatDateAtTime } from '@/lib/format-date';
import { pluralize } from '@/lib/pluralize';

type SegmentTableProps = {
  segments: SegmentListItem[];
  view: SegmentsView;
  canEdit: boolean;
};

const headClass = 'text-xs font-semibold tracking-wide text-text-muted uppercase';

export function SegmentTable(props: SegmentTableProps) {
  return (
    <>
      <div className="hidden md:block">
        <DesktopTable {...props} />
      </div>
      <ul aria-label="Segments" className="divide-y divide-border md:hidden">
        {props.segments.map((segment) => (
          <MobileRow key={segment.id} segment={segment} {...props} />
        ))}
      </ul>
    </>
  );
}

function DesktopTable({ segments, view, canEdit }: SegmentTableProps) {
  return (
    <Table bare aria-label="Segments">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={`${headClass} h-12 pl-4`}>Segment name</TableHead>
          <TableHead className={headClass}>Contacts</TableHead>
          <TableHead className={headClass}>Last edited</TableHead>
          <TableHead className={`${headClass} pr-4 text-right`}>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((segment) => (
          <TableRow key={segment.id}>
            <TableCell className="h-14 pl-4 font-semibold">
              <SegmentName segment={segment} view={view} />
            </TableCell>
            <TableCell className="text-text-secondary">
              {pluralize(segment.contactCount, 'contact')}
            </TableCell>
            <TableCell className="whitespace-nowrap text-text-secondary">
              {formatDateAtTime(segment.updatedAt)}
            </TableCell>
            <TableCell className="pr-4">
              <RowActions segment={segment} view={view} canEdit={canEdit} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MobileRow({ segment, view, canEdit }: SegmentTableProps & { segment: SegmentListItem }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold">
          <SegmentName segment={segment} view={view} />
        </p>
        <p className="text-sm text-text-muted">
          {pluralize(segment.contactCount, 'contact')} · {formatDateAtTime(segment.updatedAt)}
        </p>
      </div>
      <RowActions segment={segment} view={view} canEdit={canEdit} />
    </li>
  );
}

function SegmentName({ segment, view }: { segment: SegmentListItem; view: SegmentsView }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <Link
        href={segmentsHref({ ...view, view: segment.id })}
        className="rounded-sm break-words hover:text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {segment.name}
      </Link>
      {view.status === 'all' && segment.archivedAt ? (
        <Badge variant="neutral">Archived</Badge>
      ) : null}
    </span>
  );
}

function RowActions({
  segment,
  view,
  canEdit,
}: Omit<SegmentTableProps, 'segments' | 'selection'> & { segment: SegmentListItem }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {canEdit ? (
        <Link
          href={segmentsHref({ ...view, edit: segment.id })}
          aria-label={`Edit ${segment.name}`}
          className="inline-grid size-8 place-items-center rounded-md text-text-secondary hover:bg-neutral-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Pencil aria-hidden="true" size={14} />
        </Link>
      ) : null}
      <SegmentActionsMenu segment={segment} view={view} canEdit={canEdit} />
    </div>
  );
}
