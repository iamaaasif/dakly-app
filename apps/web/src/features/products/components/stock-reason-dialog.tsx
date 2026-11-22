'use client';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';
import { Textarea } from '@dakly/ui/textarea';

type StockReasonDialogProps = {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

// One reason covers every stock change in the save, so the history shows why together.
export function StockReasonDialog({ onCancel, onConfirm }: StockReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title="Why did the stock change?" open onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          This goes into the stock history for every variant whose stock you changed.
        </p>
        <label className="block text-sm font-medium text-text">
          Reason
          <Textarea
            value={reason}
            maxLength={500}
            aria-invalid={error ? true : undefined}
            className="mt-1"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!reason.trim()) return setError('Enter a reason');
              setError(null);
              onConfirm(reason.trim());
              setReason('');
            }}
          >
            Save with this reason
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
