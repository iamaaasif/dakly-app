import type {
  ContactKind,
  ContactListItemResponse,
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
  if (lifecycleStage === 'best') return { label: 'VIP', variant: 'ai' };
  if (isHighValue) return { label: 'High-value', variant: 'success' };
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
