'use client';
import { useForm } from 'react-hook-form';

import type { BrandProfile } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';

import { useSaveBrandProfile } from '../api/brand-profile';
import { brandResolver, profileOf, valuesOf, type BrandValues } from './brand-form';
import { BrandOrderSection } from './brand-order-section';
import { BrandSamplePanel } from './brand-sample-panel';
import { BrandShopSection } from './brand-shop-section';
import { BrandVoiceSection } from './brand-voice-section';

type BrandProfileFormProps = { profile: BrandProfile; canEdit: boolean; shopName: string };

export function BrandProfileForm({ profile, canEdit, shopName }: BrandProfileFormProps) {
  const form = useForm<BrandValues>({ resolver: brandResolver, defaultValues: valuesOf(profile) });
  const save = useSaveBrandProfile();
  const submit = form.handleSubmit((values) =>
    save.mutate(profileOf(values), { onSuccess: (saved) => form.reset(valuesOf(saved)) }),
  );
  const values = form.watch();
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={submit} noValidate className="space-y-4">
        <BrandShopSection form={form} disabled={!canEdit} shopName={shopName} />
        <BrandVoiceSection form={form} disabled={!canEdit} />
        <BrandOrderSection form={form} disabled={!canEdit} />
        {save.error && (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        )}
        {canEdit && (
          <SaveRow saving={save.isPending} saved={save.isSuccess && !form.formState.isDirty} />
        )}
      </form>
      <BrandSamplePanel values={values} shopName={shopName} />
    </div>
  );
}

function SaveRow({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" loading={saving}>
        Save brand profile
      </Button>
      {saved && (
        <p role="status" className="text-sm text-success">
          Brand profile saved
        </p>
      )}
    </div>
  );
}
