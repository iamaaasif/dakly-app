import type {
  ContactKind,
  ContactListItemResponse,
  ContactListType,
  ContactResponse,
  LifecycleStage,
} from '@dakly/contracts/contacts';

import { formatPhone } from '@/lib/format-phone';

export const customerKindLabels: Record<ContactKind, string> = {
  customer: 'Customer',
  lead: 'Lead',
  chat_only: 'Chat only',
  not_customer: 'Not a customer',
};

export const channelLabels = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  messenger: 'Messenger',
  instagram: 'Instagram',
  email: 'Email',
} as const;

// The API sends a masked phone to members without See full phone numbers; show it as sent.
export function customerPhone(customer: Pick<ContactResponse, 'phone'>) {
  return customer.phone ? formatPhone(customer.phone) : 'No phone yet';
}

export const profileTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'orders', label: 'Orders' },
  { value: 'activity', label: 'Activity timeline' },
  { value: 'campaigns', label: 'Campaign history' },
  { value: 'notes', label: 'Notes' },
  { value: 'marketing', label: 'Marketing preferences' },
] as const;
export type ProfileTab = (typeof profileTabs)[number]['value'];

export function parseProfileTab(value: string | undefined): ProfileTab {
  return profileTabs.find((tab) => tab.value === value)?.value ?? 'overview';
}

export const customerTypeLabels: Record<ContactListType, string> = {
  new: 'New',
  returning: 'Returning',
  vip: 'VIP',
  inactive: 'Inactive',
  high_value: 'High-value',
  at_risk: 'At-risk',
};

const stageLabels: Record<LifecycleStage, string> = {
  none: 'Contact',
  new: 'New',
  bought_once: 'One-time',
  regulars: 'Returning',
  best: 'VIP',
  slipping_away: 'At-risk',
  stopped_buying: 'Inactive',
};

type CustomerType = Pick<ContactListItemResponse, 'lifecycleStage' | 'isHighValue'>;
type CustomerTypePill = {
  label: string;
  variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'ai';
};

// One pill, as in the design: VIP wins over High-value, which wins over the lifecycle stage.
export function customerTypePill({ lifecycleStage, isHighValue }: CustomerType): CustomerTypePill {
  if (lifecycleStage === 'best') return { label: stageLabels.best, variant: 'ai' };
  if (isHighValue) return { label: customerTypeLabels.high_value, variant: 'success' };
  const variants: Record<LifecycleStage, CustomerTypePill['variant']> = {
    none: 'neutral',
    new: 'info',
    bought_once: 'neutral',
    regulars: 'neutral',
    best: 'ai',
    slipping_away: 'warning',
    stopped_buying: 'danger',
  };
  return { label: stageLabels[lifecycleStage], variant: variants[lifecycleStage] };
}

// Where the customer or the order came from. Orders add two sources contacts do not have.
export const profileSourceLabels = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  comment: 'Comment',
  order_link: 'Order link',
  manual: 'Added by hand',
  voice: 'Added by voice',
  import: 'Import',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  pos: 'Shop counter',
  pos_csv: 'POS CSV',
  khata_import: 'Khata import',
} as const;

export const campaignResultLabels = {
  tapped: 'Read · clicked',
  read: 'Read',
  delivered: 'Delivered',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
} as const;
