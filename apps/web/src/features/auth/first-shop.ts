import type { CreateStoreInput } from '@dakly/contracts/stores';

export type BusinessDetails = {
  businessName: string;
  websiteUrl?: string;
  offering: NonNullable<CreateStoreInput['offering']>;
};

// Sign-up does not ask how the owner sells or how many customers they have, so the first shop
// starts on the free plan with the most common answer. "Change setup" and Settings correct it.
export function firstShopInput({
  businessName,
  websiteUrl,
  offering,
}: BusinessDetails): CreateStoreInput {
  return {
    name: businessName,
    websiteUrl,
    offering,
    howYouSell: ['social_media'],
    customerListSize: 'under_500',
    planCode: 'free',
    billingCycle: 'monthly',
  };
}
