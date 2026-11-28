import { BrandField } from './brand-field';
import { BrandSection } from './brand-section';
import type { BrandSectionProps } from './brand-section-props';

export function BrandOrderSection({ form, disabled }: BrandSectionProps) {
  const shared = { form, disabled };
  return (
    <BrandSection
      title="How customers order"
      hint="Added at the end of posts and messages when you choose."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <BrandField {...shared} name="callToActionEn" label="In English" />
        <BrandField {...shared} name="callToActionBn" label="In Bangla" />
      </div>
      <BrandField
        {...shared}
        oneLine
        name="hashtags"
        label="Your hashtags"
        hint="Added to Facebook and Instagram posts."
      />
    </BrandSection>
  );
}
