'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm } from 'react-hook-form';

import {
  type CreateSegmentInput,
  createSegmentSchema,
  type SegmentResponse,
} from '@dakly/contracts/segments';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
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
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <h1 className="text-xl font-bold break-words">
            {segment ? `Edit ${segment.name}` : 'New segment'}
          </h1>
          <FormField name="name" label="Segment name">
            {(control) => <Input {...control} {...form.register('name')} />}
          </FormField>
          <SegmentConditions />
          {form.formState.errors.root ? (
            <p role="alert" className="text-danger">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={create.isPending || change.isPending}>
              Save segment
            </Button>
            <Link
              href={listHref}
              className="inline-flex min-h-10 items-center text-action underline"
            >
              Cancel
            </Link>
          </div>
        </div>
        <LiveCount />
      </form>
    </FormProvider>
  );
}
