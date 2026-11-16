import type { ContactKind, ContactResponse } from '@dakly/contracts/contacts';

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
} as const;

// The API sends a masked phone to members without See full phone numbers; show it as sent.
export function customerPhone(customer: Pick<ContactResponse, 'phone'>) {
  return customer.phone ? formatPhone(customer.phone) : 'No phone yet';
}
