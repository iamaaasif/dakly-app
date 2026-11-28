import { profileOf, type BrandLanguage, type BrandValues } from './brand-form';

const openings: Record<BrandLanguage, (shop: string) => string> = {
  bn: (shop) => `${shop}-এ নতুন এসেছে!`,
  en: (shop) => `New arrivals at ${shop}!`,
  banglish: (shop) => `${shop}-e notun eshechhe!`,
};

// A fixed template, not an AI call, so the panel costs no credits and updates as you type.
export function brandSample(values: BrandValues, shopName: string) {
  const profile = profileOf(values);
  const orderLine = values.language === 'en' ? profile.callToActionEn : profile.callToActionBn;
  return [openings[values.language](shopName), orderLine, profile.hashtags.join(' ')].filter(
    (part): part is string => Boolean(part),
  );
}
