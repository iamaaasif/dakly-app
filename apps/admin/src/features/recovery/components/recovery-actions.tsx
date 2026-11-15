'use client';
import { Button } from '@dakly/ui/button';

import { type useRecoverAccount } from '../api/recovery';

export function RecoveryActions({
  recover,
  onClose,
}: {
  recover: ReturnType<typeof useRecoverAccount>;
  onClose: () => void;
}) {
  return (
    <>
      {recover.isSuccess ? (
        <p role="status">
          Account recovered. All old sessions are signed out. Security notices are queued.
        </p>
      ) : (
        <Button type="submit" variant="danger" loading={recover.isPending}>
          Confirm account recovery
        </Button>
      )}
      <Button type="button" variant="secondary" disabled={recover.isPending} onClick={onClose}>
        {recover.isSuccess ? 'Close' : 'Cancel'}
      </Button>
    </>
  );
}
