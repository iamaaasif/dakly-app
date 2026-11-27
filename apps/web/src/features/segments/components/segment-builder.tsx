'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm } from 'react-hook-form';

import {
  type CreateSegmentInput,
  createSegmentSchema,
  type SegmentResponse,
} from '@dakly/contracts/segments';
import { ApiError } from '@dakly/ui/api-client';
import { Button, buttonVariants } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { useChangeSegment } from '../api/change-segment';
import { useCreateSegment } from '../api/create-segment';
import { groupLooseConditions, newGroup } from '../segment-labels';
import { LiveCount } from './live-count';
import { SegmentConditions } from './segment-conditions';
import { formError } from '@/lib/form-error';

type SegmentBuilderProps = {
  segment?: SegmentResponse;
  listHref: string;
  canEdit?: boolean;
  // Opened from View: the same screen with every field locked.
  readOnly?: boolean;
};

// The form, and the save that returns to the list or marks a taken name on its field.
function useSegmentForm(segment: SegmentResponse | undefined, listHref: string) {
  const router = useRouter();
  const form = useForm<CreateSegmentInput>({
    resolver: zodResolver(createSegmentSchema),
    defaultValues: segment
      ? { name: segment.name, rules: groupLooseConditions(segment.rules) }
      : { name: '', rules: { match: 'all', conditions: [newGroup()] } },
  });
  const create = useCreateSegment();
  const change = useChangeSegment(segment?.id ?? '');
  const handleSubmit = form.handleSubmit(async (input) => {
    try {
      if (segment) await change.mutateAsync(input);
      else await create.mutateAsync(input);
      router.push(listHref);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SEGMENT_NAME_TAKEN')
        form.setError('name', { message: error.message });
      else formError(error, form.setError);
    }
  });
  return { form, handleSubmit, isPending: create.isPending || change.isPending };
}

export function SegmentBuilder({
  segment,
  listHref,
  canEdit = true,
  readOnly = false,
}: SegmentBuilderProps) {
  const { form, handleSubmit, isPending } = useSegmentForm(segment, listHref);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <BuilderHeader
          segment={segment}
          listHref={listHref}
          canEdit={canEdit}
          readOnly={readOnly}
          isPending={isPending}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <Card className="min-w-0 space-y-5 p-4 sm:p-5">
            {/* A disabled fieldset locks every control inside it, selects included. */}
            <fieldset disabled={readOnly} className="min-w-0 space-y-5">
              <FormField name="name" label="Segment name">
                {(control) => (
                  <Input
                    {...control}
                    {...form.register('name')}
                    placeholder="e.g. Winback customers"
                  />
                )}
              </FormField>
              <SegmentConditions />
            </fieldset>
            {form.formState.errors.root ? (
              <p role="alert" className="text-danger">
                {form.formState.errors.root.message}
              </p>
            ) : null}
          </Card>
          <LiveCount />
        </div>
      </form>
    </FormProvider>
  );
}

type BuilderHeaderProps = Pick<
  SegmentBuilderProps,
  'segment' | 'listHref' | 'canEdit' | 'readOnly'
> & {
  isPending: boolean;
};

function BuilderHeader({ segment, listHref, canEdit, readOnly, isPending }: BuilderHeaderProps) {
  const title = headerTitle(segment, readOnly);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={listHref}
          aria-label="Back to segments"
          className="inline-grid size-10 place-items-center rounded-md text-text-secondary hover:bg-neutral-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </Link>
        <h1 className="text-page font-bold tracking-tight break-words">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Link href={listHref} className={buttonVariants({ variant: 'secondary' })}>
          {readOnly ? 'Back' : 'Cancel'}
        </Link>
        <HeaderAction
          segment={segment}
          listHref={listHref}
          canEdit={canEdit}
          readOnly={readOnly}
          isPending={isPending}
        />
      </div>
    </header>
  );
}

function HeaderAction({ segment, listHref, canEdit, readOnly, isPending }: BuilderHeaderProps) {
  if (!readOnly)
    return (
      <Button type="submit" variant="primary" loading={isPending}>
        Save segment
      </Button>
    );
  if (!canEdit || !segment) return null;
  const separator = listHref.includes('?') ? '&' : '?';
  return (
    <Link href={`${listHref}${separator}edit=${segment.id}`} className={buttonVariants()}>
      Edit segment
    </Link>
  );
}

function headerTitle(segment: SegmentResponse | undefined, readOnly: boolean | undefined) {
  if (!segment) return 'New segment';
  return readOnly ? segment.name : `Edit ${segment.name}`;
}
