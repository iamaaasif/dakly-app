import type { SignUpSource } from '@dakly/contracts/auth';

export const hearSources: { value: SignUpSource; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'facebook_group', label: 'Facebook group' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'google_search', label: 'Google Search' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'other', label: 'Other' },
];

export const offerings = [
  { value: 'products', label: 'Products', hint: 'Clothing, cosmetics, gadgets, food' },
  { value: 'services', label: 'Services', hint: 'Salons, tutors, travel, clinics' },
  { value: 'both', label: 'Both', hint: 'Products and services together' },
] as const;
