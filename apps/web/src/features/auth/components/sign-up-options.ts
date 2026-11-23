export const hearSources = [
  'Facebook',
  'Facebook group',
  'YouTube',
  'ChatGPT',
  'Google Search',
  'Phone call',
  'Other',
] as const;

export const offerings = [
  { value: 'products', label: 'Products', hint: 'Clothing, cosmetics, gadgets, food' },
  { value: 'services', label: 'Services', hint: 'Salons, tutors, travel, clinics' },
  { value: 'both', label: 'Both', hint: 'Products and services together' },
] as const;
