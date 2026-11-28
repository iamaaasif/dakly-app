import Link from 'next/link';

import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { useStoreDetails } from '../api/store-details';
import { BrandField } from './brand-field';
import { BrandSection } from './brand-section';
import type { BrandSectionProps } from './brand-section-props';

function KnownField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} readOnly disabled />
    </div>
  );
}

// The shop already gave these at sign-up, so they are shown from Store settings, not asked again.
export function BrandShopSection({
  form,
  disabled,
  shopName,
}: BrandSectionProps & { shopName: string }) {
  const settings = useStoreDetails().data;
  return (
    <BrandSection title="About your shop" hint="Dakly reads this before writing anything for you.">
      <div className="grid gap-4 sm:grid-cols-2">
        <KnownField id="brand-shopName" label="Shop name" value={shopName} />
        {settings?.websiteUrl && (
          <KnownField id="brand-website" label="Website or page link" value={settings.websiteUrl} />
        )}
      </div>
      {settings?.businessType && (
        <KnownField id="brand-businessType" label="What you sell" value={settings.businessType} />
      )}
      <p className="text-sm text-text-muted">
        From your sign-up details.{' '}
        <Link href="/settings" className="font-medium text-action hover:underline">
          Change in Store settings
        </Link>
      </p>
      <BrandField
        form={form}
        disabled={disabled}
        name="audience"
        label="Who your customers are"
        hint="Age, city, how they shop. Plain words are fine."
      />
    </BrandSection>
  );
}
