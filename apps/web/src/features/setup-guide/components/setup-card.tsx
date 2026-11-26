'use client';
import { Check, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';

import type { SessionContext } from '@dakly/contracts/sessions';
import type { SetupChecklistResponse } from '@dakly/contracts/setup-checklist';
import { Button, buttonVariants } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

import { useHideSetupChecklist, useSetupChecklist } from '../api/setup-checklist';
import { setupStepCopy } from './setup-steps';
import { useSessionContext } from '@/lib/session-context';

export function SetupCard() {
  const store = useSessionContext().data?.currentStore;
  const { data } = useSetupChecklist(Boolean(store));
  const hide = useHideSetupChecklist();
  if (!store || !data || data.hidden) return null;

  const { steps } = data;
  if (!steps.length) return null;

  const doneCount = steps.filter(({ done }) => done).length;
  const allDone = doneCount === steps.length;
  const canHide = store.canChangeExtensions && steps.every(({ done }) => done);

  return (
    <Card
      aria-labelledby="setup-guide-title"
      role="region"
      className="shadow-xs @container overflow-hidden rounded-lg p-0"
    >
      <SetupCardHeader
        allDone={allDone}
        canHide={canHide}
        done={doneCount}
        total={steps.length}
        hiding={hide.isPending}
        onHide={() => hide.mutate()}
      />
      {hide.error && (
        <p role="alert" className="px-5 pt-4 text-sm text-danger">
          {hide.error.message}
        </p>
      )}
      <SetupSteps steps={steps} store={store} />
    </Card>
  );
}

function SetupSteps({
  steps,
  store,
}: {
  steps: SetupChecklistResponse['steps'];
  store: NonNullable<SessionContext['currentStore']>;
}) {
  const editable = {
    add_store_details: store.canEditStoreSettings,
    connect_channel: store.canEditStoreSettings,
    add_products: store.canEditProducts,
  };
  const nextIndex = steps.findIndex(({ id, done }) => !done && editable[id]);

  return (
    <ol
      aria-label="Setup steps"
      className={cn(
        'grid gap-4 p-4 sm:p-5',
        steps.length === 2 && '@min-[620px]:grid-cols-2',
        steps.length === 3 && '@min-[830px]:grid-cols-3',
      )}
    >
      {steps.map(({ id, done }, index) => (
        <SetupStepCard
          key={id}
          id={id}
          done={done}
          index={index}
          isNext={index === nextIndex}
          canEdit={editable[id]}
        />
      ))}
    </ol>
  );
}

function SetupStepCard(props: {
  id: keyof typeof setupStepCopy;
  done: boolean;
  index: number;
  isNext: boolean;
  canEdit: boolean;
}) {
  const { id, done, index, isNext, canEdit } = props;
  const copy = setupStepCopy[id];
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-4 sm:p-5',
        isNext ? 'shadow-xs border-border-strong' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            done && 'bg-success-soft text-success',
            isNext && 'bg-inverse text-on-primary',
            !done && !isNext && 'bg-surface-muted text-text-muted',
          )}
        >
          {done ? <Check size={20} /> : index + 1}
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
            Step {index + 1}
          </p>
          <h3 className="text-md leading-tight font-bold tracking-tight">{copy.title}</h3>
          <p className="text-sm text-text-muted">{copy.hint}</p>
        </div>
      </div>
      <div className="flex min-h-36 flex-1 flex-col justify-center gap-2 rounded-lg border border-border bg-background p-3">
        {copy.preview}
      </div>
      <SetupStepAction id={id} done={done} canEdit={canEdit} isNext={isNext} />
    </li>
  );
}

function SetupStepAction({
  id,
  done,
  canEdit,
  isNext,
}: {
  id: keyof typeof setupStepCopy;
  done: boolean;
  canEdit: boolean;
  isNext: boolean;
}) {
  if (done) return <p className="min-h-10 text-sm font-semibold text-success">Done</p>;
  if (!canEdit) return null;
  const copy = setupStepCopy[id];
  return (
    <Link
      href={copy.href}
      className={cn(
        buttonVariants({ variant: isNext ? 'primary' : 'secondary' }),
        !isNext && 'border-inverse bg-inverse text-on-primary hover:bg-inverse/85',
      )}
    >
      {id === 'add_products' && <Plus aria-hidden="true" size={16} />}
      {copy.button}
      {id !== 'add_products' && <ChevronRight aria-hidden="true" size={16} />}
    </Link>
  );
}

function SetupProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-inverse"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
      <span className="text-base font-medium">
        {done} of {total} done
      </span>
    </div>
  );
}

function SetupCardHeader(props: {
  allDone: boolean;
  canHide: boolean;
  done: number;
  total: number;
  hiding: boolean;
  onHide: () => void;
}) {
  const { allDone, canHide, done, total, hiding, onHide } = props;
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-border bg-linear-to-b from-background to-surface px-4 py-5 sm:px-6 @min-[680px]:flex-row @min-[680px]:items-center">
      <div>
        <h2 id="setup-guide-title" className="text-lg font-bold tracking-tight">
          {allDone ? 'You’re all set' : `Get started in ${total} ${total === 1 ? 'step' : 'steps'}`}
        </h2>
        <p className="text-sm text-text-muted">
          {allDone
            ? 'Dakly is ready to grow your sales.'
            : 'Finish these steps so Dakly can start answering customers and taking orders.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SetupProgress done={done} total={total} />
        {canHide && (
          <Button variant="secondary" loading={hiding} onClick={onHide}>
            Hide guide
          </Button>
        )}
      </div>
    </div>
  );
}
