'use client';

import type { ProductResponse } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

import { useArchiveProduct } from '../api/archive-product';
import { useChangeProduct } from '../api/change-product';
import { SessionDialog } from '@/components/session-dialog';

type ArchiveProductDialogProps = {
  product: ProductResponse;
  onClose: () => void;
  onArchived?: () => void;
  onHidden?: (product: ProductResponse) => void;
};

export function ArchiveProductDialog({
  product,
  onClose,
  onArchived,
  onHidden,
}: ArchiveProductDialogProps) {
  const archive = useArchiveProduct(product.id, onArchived);
  const change = useChangeProduct(product.id, onHidden);
  const isPending = archive.isPending || change.isPending;
  const hasOpenOrders =
    archive.error instanceof ApiError && archive.error.code === 'PRODUCT_HAS_OPEN_ORDERS';
  const error = change.error ?? archive.error;
  const canHide = hasOpenOrders && product.status === 'active';
  return (
    <SessionDialog
      title={`Archive ${product.name}?`}
      open
      onClose={onClose}
      closeDisabled={isPending}
    >
      <p className="text-sm text-text-muted">
        {canHide
          ? 'You can hide it from customers while you finish the open orders.'
          : 'The product will be removed from your catalogue. Past orders will keep their details.'}
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        {canHide ? (
          <Button
            loading={change.isPending}
            onClick={() => change.mutate({ status: 'hidden' }, { onSuccess: onClose })}
          >
            Hide product
          </Button>
        ) : (
          <Button
            variant="danger"
            loading={archive.isPending}
            disabled={change.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: onClose })}
          >
            Archive product
          </Button>
        )}
      </div>
    </SessionDialog>
  );
}
