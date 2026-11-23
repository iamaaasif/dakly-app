'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, FormProvider } from 'react-hook-form';

import { setupStoreSchema } from '@dakly/contracts/stores';
import { Button } from '@dakly/ui/button';

import type { BusinessDraft } from '../auth.types';
import { BusinessFields } from './business-fields';

const businessSchema = setupStoreSchema.omit({ planCode: true, billingCycle: true });
export function BusinessDetails({
  draft,
  onNext,
}: {
  draft?: BusinessDraft;
  onNext: (draft: BusinessDraft) => void;
}) {
  const form = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: draft ?? {
      name: '',
      businessType: '',
      district: '',
      howYouSell: [],
      customerListSize: undefined,
    },
  });
  return (
    <FormProvider {...form}>
      <form method="post" className="space-y-6" onSubmit={form.handleSubmit(onNext)}>
        <BusinessFields />
        <Button type="submit">Choose a plan</Button>
      </form>
    </FormProvider>
  );
}
