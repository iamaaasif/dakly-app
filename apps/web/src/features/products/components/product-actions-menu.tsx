'use client';
import { Archive, Boxes, Copy } from 'lucide-react';
import { useRef, useState } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { DropdownMenuItem } from '@dakly/ui/dropdown-menu';
import { RowActionsMenu } from '@dakly/ui/row-actions-menu';
import { useToast } from '@dakly/ui/toast';

import { useDuplicateProduct } from '../api/duplicate-product';
import { ArchiveProductDialog } from './archive-product-dialog';
import { useUrlRouter } from '@/lib/use-url-query';

type ProductActionsMenuProps = {
  product: ProductResponse;
  onChangeStock?: (productId: string) => void;
  onArchived?: () => void;
  onHidden?: (product: ProductResponse) => void;
};

function useDuplicate(product: ProductResponse) {
  const router = useUrlRouter();
  const showToast = useToast();
  const duplicate = useDuplicateProduct(product.id);
  const copy = () =>
    duplicate.mutate(undefined, {
      onSuccess: (copied) => {
        showToast(`${product.name} copied as a draft.`);
        router.push(`/products/${copied.id}`);
      },
      onError: (error) => showToast(error.message),
    });
  return { copy, pending: duplicate.isPending };
}

export function ProductActionsMenu({
  product,
  onChangeStock,
  onArchived,
  onHidden,
}: ProductActionsMenuProps) {
  const [archiving, setArchiving] = useState(false);
  const openArchive = useRef(false);
  const { copy, pending } = useDuplicate(product);
  return (
    <>
      <RowActionsMenu
        label={`More actions for ${product.name}`}
        onCloseAutoFocus={() => {
          if (!openArchive.current) return;
          openArchive.current = false;
          // Let the menu give focus back to its button first; the dialog restores that focus on close.
          setTimeout(() => setArchiving(true), 0);
        }}
      >
        <DropdownMenuItem disabled={pending} onSelect={copy}>
          <Copy size={16} aria-hidden="true" />
          Duplicate
        </DropdownMenuItem>
        {onChangeStock && product.isStockTracked ? (
          <DropdownMenuItem onSelect={() => onChangeStock(product.id)}>
            <Boxes size={16} aria-hidden="true" />
            Change stock
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="text-danger"
          onSelect={() => {
            openArchive.current = true;
          }}
        >
          <Archive size={16} aria-hidden="true" />
          Archive
        </DropdownMenuItem>
      </RowActionsMenu>
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
