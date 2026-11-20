'use client';
import { Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button, buttonVariants } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

import { useChangeSetupChecklist, useSetupChecklist } from '../api/setup-checklist';
import { HowYouSellDialog } from './how-you-sell-dialog';
import { setupStepCopy } from './setup-steps';
import { useSessionContext } from '@/lib/session-context';

export function SetupCard() {
  const { data: session } = useSessionContext();
  const { data } = useSetupChecklist(Boolean(session?.currentStore));
  const change = useChangeSetupChecklist();
  const [open, setOpen] = useState(false);
  if (!data || data.hidden) return null;

  const canChange = Boolean(session?.currentStore?.canChangeExtensions);
  const doneCount = data.steps.filter(({ done }) => done).length;
  const allDone = doneCount === data.steps.length;
  const nextId = data.steps.find(({ done }) => !done)?.id;

  return (
    <Card aria-labelledby="setup-guide-title" role="region" className="space-y-4 p-4 md:p-6">
      <SetupCardHeader
        allDone={allDone}
        canChange={canChange}
        done={doneCount}
        total={data.steps.length}
        hiding={change.isPending}
        onChange={() => setOpen(true)}
        onHide={() => change.mutate({ hidden: true })}
      />
      {change.error && (
        <p role="alert" className="text-sm text-danger">
          {change.error.message}
        </p>
      )}
      <ol className={cn('grid gap-4 md:grid-cols-2', data.steps.length > 2 && 'xl:grid-cols-3')}>
        {data.steps.map(({ id, done }, index) => (
          <SetupStepCard key={id} id={id} done={done} index={index} isNext={id === nextId} />
        ))}
      </ol>
      <HowYouSellDialog open={open} answers={data.howYouSell} onClose={() => setOpen(false)} />
    </Card>
  );
}

function SetupStepCard(props: {
  id: keyof typeof setupStepCopy;
  done: boolean;
  index: number;
  isNext: boolean;
}) {
  const { id, done, index, isNext } = props;
  const copy = setupStepCopy[id];
  return (
    <li
      className={cn(
        'rounded-xl flex flex-col gap-3 border bg-surface p-4',
        isNext ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            done && 'bg-success-soft text-success',
            isNext && 'bg-primary text-on-primary',
            !done && !isNext && 'bg-surface-muted text-text-muted',
          )}
        >
          {done ? <Check size={20} /> : copy.icon}
        </span>
        <span className="text-xs font-bold tracking-wider text-text-muted uppercase">
          Step {index + 1}
        </span>
      </div>
      <div className="flex-1">
        <h3 className="text-md font-semibold">{copy.title}</h3>
        <p className="text-sm text-text-muted">{copy.hint}</p>
      </div>
      {done ? (
        <p className="min-h-10 text-base font-medium text-success">Done</p>
      ) : (
        <Link
          href={copy.href}
          className={buttonVariants({ variant: isNext ? 'primary' : 'secondary' })}
        >
          {copy.button}
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
      )}
    </li>
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
        <div className="h-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <span className="text-base font-medium">
        {done} of {total} done
      </span>
    </div>
  );
}

function SetupCardHeader(props: {
  allDone: boolean;
  canChange: boolean;
  done: number;
  total: number;
  hiding: boolean;
  onChange: () => void;
  onHide: () => void;
}) {
  const { allDone, canChange, done, total, hiding, onChange, onHide } = props;
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
      <div>
        <h2 id="setup-guide-title" className="text-lg font-bold">
          {allDone ? 'You’re all set' : 'Get started with Dakly'}
        </h2>
        <p className="text-sm text-text-muted">
          {allDone
            ? 'Dakly is ready to grow your sales.'
            : `${total} steps to start getting repeat sales.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canChange && (
          <Button variant="link" className="min-h-10" onClick={onChange}>
            Change setup
          </Button>
        )}
        <SetupProgress done={done} total={total} />
        {allDone && canChange && (
          <Button variant="secondary" loading={hiding} onClick={onHide}>
            Hide guide
          </Button>
        )}
      </div>
    </div>
  );
}
