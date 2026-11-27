'use client';
import { Archive, ArchiveRestore, Eye, Megaphone, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import type { SegmentResponse } from '@dakly/contracts/segments';
import { DropdownMenuItem, DropdownMenuSeparator } from '@dakly/ui/dropdown-menu';
import { RowActionsMenu } from '@dakly/ui/row-actions-menu';
import { useToast } from '@dakly/ui/toast';

import { useArchiveSegment } from '../api/archive-segment';
import { segmentsHref, type SegmentsView } from '../segments-view';
import { DeleteSegmentDialog } from './delete-segment-dialog';
import { useSessionContext } from '@/lib/session-context';

function useArchiveToggle(segment: SegmentResponse) {
  const showToast = useToast();
  const archive = useArchiveSegment();
  const archived = segment.archivedAt !== null;
  const change = () =>
    archive.mutate(
      { segmentId: segment.id, archived: !archived },
      {
        onSuccess: () => showToast(`${segment.name} ${archived ? 'restored' : 'archived'}.`),
        onError: (error) => showToast(error.message),
      },
    );
  return { archived, change, pending: archive.isPending };
}

type SegmentActionsMenuProps = { segment: SegmentResponse; view: SegmentsView; canEdit: boolean };

export function SegmentActionsMenu({ segment, view, canEdit }: SegmentActionsMenuProps) {
  const [deleting, setDeleting] = useState(false);
  const openDelete = useRef(false);
  const { archived, change, pending } = useArchiveToggle(segment);
  const { data: context } = useSessionContext();
  return (
    <>
      <RowActionsMenu
        label={`More actions for ${segment.name}`}
        onCloseAutoFocus={() => {
          if (!openDelete.current) return;
          openDelete.current = false;
          // Let the menu return focus to its button first; the dialog restores that focus on close.
          setTimeout(() => setDeleting(true), 0);
        }}
      >
        <DropdownMenuItem asChild>
          <Link href={segmentsHref({ ...view, view: segment.id })}>
            <Eye aria-hidden="true" size={16} />
            View
          </Link>
        </DropdownMenuItem>
        {/* An archived segment cannot be picked for a campaign. */}
        {!archived && context?.currentStore?.canEditCampaigns ? (
          <DropdownMenuItem asChild>
            <Link href="/campaigns/new">
              <Megaphone aria-hidden="true" size={16} />
              Create campaign
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canEdit ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={change}>
              {archived ? (
                <ArchiveRestore aria-hidden="true" size={16} />
              ) : (
                <Archive aria-hidden="true" size={16} />
              )}
              {archived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-danger"
              onSelect={() => {
                openDelete.current = true;
              }}
            >
              <Trash2 aria-hidden="true" size={16} />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </RowActionsMenu>
      {deleting ? (
        <DeleteSegmentDialog segment={segment} onClose={() => setDeleting(false)} />
      ) : null}
    </>
  );
}
