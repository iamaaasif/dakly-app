'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  breakGlassRequestSchema,
  type BreakGlassRequest,
  type BreakGlassPreview,
} from '@dakly/contracts/break-glass';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useBreakGlassPreview, useConfirmBreakGlass } from '../api/break-glass';
import { formatDate } from '@/lib/format-date';

export function BreakGlassForm({ target }: { target?: { id: string; name: string } }) {
  const preview = useBreakGlassPreview();
  const form = useForm<BreakGlassRequest>({
    resolver: zodResolver(breakGlassRequestSchema),
    defaultValues: { targetId: target?.id ?? '', reason: '', category: 'security_incident' },
  });
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Break-glass access</h2>
      <p>
        Super admins may open read-only customer access for a security incident or legal request.
        The Owner can end it. Other Super admins are alerted.
      </p>
      <form className="space-y-3" onSubmit={form.handleSubmit((input) => preview.mutate(input))}>
        <p>Selected shop: {target?.name ?? 'Choose a shop above'}</p>
        <label htmlFor="break-glass-category">Purpose</label>
        <select
          id="break-glass-category"
          className="min-h-10 w-full rounded-md border border-input-border bg-surface p-2"
          {...form.register('category')}
        >
          <option value="security_incident">Security incident</option>
          <option value="legal_request">Legal request</option>
        </select>
        <label htmlFor="break-glass-reason">Reason (10–1000 characters)</label>
        <Input id="break-glass-reason" {...form.register('reason')} />
        {Object.entries(form.formState.errors).map(([key, error]) => (
          <p role="alert" key={key}>
            {error.message}
          </p>
        ))}
        <Button type="submit" variant="danger" loading={preview.isPending} disabled={!target}>
          Review break-glass access
        </Button>
        {preview.error ? <p role="alert">{preview.error.message}</p> : null}
      </form>
      {preview.data ? (
        <ConfirmBreakGlass
          key={preview.data.effect.id}
          preview={preview.data}
          onClose={() => preview.reset()}
        />
      ) : null}
    </Card>
  );
}
function ConfirmBreakGlass({
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

function EffectDetails({ effect }: { effect: BreakGlassPreview['effect'] }) {
  return (
    <>
      <p className="break-words">Shop: {effect.shopName}</p>
      <p className="break-all">Shop ID: {effect.targetId}</p>
      <p>
        Purpose: {effect.category === 'security_incident' ? 'Security incident' : 'Legal request'}
      </p>
      <p className="break-words">Reason: {effect.reason}</p>
      <p>
        Read customer records by ID only. No changes or Owner approval. The Owner can end access at
        any time.
      </p>
      <p>
        Deadline: {formatDate(effect.expiresAt)}. Thirty minutes from this preview; confirming does
        not extend it.
      </p>
      <p>
        Confirm by {formatDate(effect.confirmBy)}. The action is recorded in staff and shop history
        and alerts other Super admins.
      </p>
    </>
  );
}
