'use client';
import { useEffect, useRef } from 'react';
import { type BreakGlassPreview } from '@dakly/contracts/break-glass';
import { Button } from '@dakly/ui/button';
import { useConfirmBreakGlass } from '../api/break-glass';
import { EffectDetails } from './effect-details';

export function ConfirmBreakGlass({
  preview,
  onClose,
}: {
  preview: BreakGlassPreview;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useConfirmBreakGlass();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const effect = preview.effect;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="break-glass-confirm-title"
      className="m-auto w-full max-w-lg space-y-4 rounded-md border border-border bg-surface p-5 text-text"
    >
      <h2 id="break-glass-confirm-title" className="text-lg font-semibold">
        Confirm break-glass access
      </h2>
      <EffectDetails effect={effect} />
      {confirm.error ? <p role="alert">{confirm.error.message}</p> : null}
      {confirm.isSuccess ? (
        <p role="status">Break-glass access recorded. Open it from your recent requests.</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {!confirm.isSuccess ? (
          <Button
            variant="danger"
            loading={confirm.isPending}
            onClick={() => confirm.mutate({ ...preview, confirmed: true })}
          >
            Confirm read-only access
          </Button>
        ) : null}
        <Button
          variant="secondary"
          disabled={confirm.isPending}
          onClick={() => dialog.current?.close()}
        >
          {confirm.isSuccess ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </dialog>
  );
}
