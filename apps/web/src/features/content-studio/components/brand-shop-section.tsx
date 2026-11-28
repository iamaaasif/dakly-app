import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { BrandField } from './brand-field';
import { BrandSection } from './brand-section';
import type { BrandSectionProps } from './brand-section-props';

export function BrandShopSection({
  form,
  disabled,
  shopName,
}: BrandSectionProps & { shopName: string }) {
  const shared = { form, disabled };
  return (
    <BrandSection title="About your shop" hint="Dakly reads this before writing anything for you.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="brand-shopName">Shop name</Label>
          <Input id="brand-shopName" value={shopName} readOnly disabled />
        </div>
        <BrandField
          {...shared}
          oneLine
          name="website"
          label="Website or page link"
          hint="Used when Dakly writes posts and messages."
        />
      </div>
      <BrandField {...shared} name="whatYouSell" label="What you sell" />
      <BrandField
        {...shared}
        name="audience"
        label="Who your customers are"
        hint="Age, city, how they shop. Plain words are fine."
      />
    </BrandSection>
  );
}
