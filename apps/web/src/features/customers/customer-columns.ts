import type { ContactSource } from '@dakly/contracts/contacts';

// The columns the Columns picker can turn on or off. Customer and Type always show.
export const customerColumns = [
  'phone',
  'whatsapp',
  'email',
  'location',
  'source',
  'tags',
  'consent',
] as const;
export type CustomerColumn = (typeof customerColumns)[number];

export const customerColumnLabels: Record<CustomerColumn, string> = {
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  email: 'Email',
  location: 'Location',
  source: 'Source',
  tags: 'Tags',
  consent: 'Consent',
};

export const defaultCustomerColumns: CustomerColumn[] = ['phone', 'whatsapp'];

export const contactSourceLabels: Record<ContactSource, string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  comment: 'Comment',
  order_link: 'Order link',
  manual: 'Added by hand',
  voice: 'Add by voice',
  import: 'Import',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  pos: 'Shop sale',
};

// An absent `columns` address value means the defaults; an empty one means none.
export function parseCustomerColumns(value: string | undefined): CustomerColumn[] {
  if (value === undefined) return defaultCustomerColumns;
  const chosen = value.split(',');
  return customerColumns.filter((column) => chosen.includes(column));
}

export function customerColumnsParam(columns: CustomerColumn[]): string | undefined {
  return columns.join(',') === defaultCustomerColumns.join(',') ? undefined : columns.join(',');
}
