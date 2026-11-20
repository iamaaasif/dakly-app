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
import { newCondition } from '../segment-labels';
import { LiveCount } from './live-count';
import { SegmentConditions } from './segment-conditions';
import { formError } from '@/lib/form-error';

type SegmentBuilderProps = {
  segment?: SegmentResponse;
  listHref: string;
};

export function SegmentBuilder({ segment, listHref }: SegmentBuilderProps) {
  const router = useRouter();
  const form = useForm<CreateSegmentInput>({
    resolver: zodResolver(createSegmentSchema),
    defaultValues: segment
      ? { name: segment.name, rules: segment.rules }
      : { name: '', rules: { match: 'all', conditions: [newCondition('tag')] } },
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

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-6 p-4 md:p-8">
        <SegmentCampaignPageHeader
          segment={segment}
          listHref={listHref}
          isPending={create.isPending || change.isPending}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <FormField name="name" label="Segment name">
              {(control) => (
                <Input
                  {...control}
                  {...form.register('name')}
                  placeholder="e.g. Winback customers"
                />
              )}
            </FormField>
            <Card className="space-y-4 p-4">
              <SegmentConditions />
              <div className="rounded-md bg-primary-soft p-3 text-xs text-text-muted">
                THEN add them to this segment. Customers join and leave automatically every day.
              </div>
            </Card>
            {form.formState.errors.root ? (
              <p role="alert" className="text-danger">
                {form.formState.errors.root.message}
              </p>
            ) : null}
          </div>
          <LiveCount />
        </div>
      </form>
    </FormProvider>
  );
}

function SegmentCampaignPageHeader({
  segment,
  listHref,
  isPending,
}: {
  segment?: SegmentResponse;
  listHref: string;
  isPending: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Link
          href={listHref}
          aria-label="Back to segments"
          className="inline-flex min-h-10 items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft aria-hidden="true" size={16} />
        </Link>
        <h1 className="text-xl font-bold break-words">
          {segment ? `Edit ${segment.name}` : 'New segment'}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Link href={listHref} className={buttonVariants({ variant: 'secondary' })}>
          Cancel
        </Link>
        <Button type="submit" variant="primary" loading={isPending}>
          Save segment
        </Button>
      </div>
    </header>
  );
}
