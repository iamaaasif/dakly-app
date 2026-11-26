'use client';
import { Archive, Copy, EllipsisVertical } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { ArchiveProductDialog } from './archive-product-dialog';

type ProductActionsMenuProps = {
  product: ProductResponse;
  onArchived?: () => void;
  onHidden?: (product: ProductResponse) => void;
};

export function ProductActionsMenu({ product, onArchived, onHidden }: ProductActionsMenuProps) {
  const [archiving, setArchiving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openArchive = useRef(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="secondary"
            className="px-2"
            aria-label={`More actions for ${product.name}`}
          >
            <EllipsisVertical size={16} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            if (!openArchive.current) return;
            openArchive.current = false;
            event.preventDefault();
            // The dialog restores the focus it sees when it opens.
            trigger.current?.focus();
            setArchiving(true);
          }}
        >
          <DropdownMenuItem asChild>
            <Link href={`/products/new?duplicate=${product.id}`} prefetch={false}>
              <Copy size={16} aria-hidden="true" />
              Duplicate
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-danger"
            onSelect={() => {
              openArchive.current = true;
            }}
          >
            <Archive size={16} aria-hidden="true" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {archiving ? (
        <ArchiveProductDialog
          product={product}
          onClose={() => setArchiving(false)}
          onArchived={onArchived}
          onHidden={onHidden}
        />
      ) : null}
    </>
  );
}
