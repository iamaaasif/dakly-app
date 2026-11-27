import { z } from 'zod';

import type { chatChannels } from './channels';
import type { OrderStage } from './orders';
import { searchText } from './search-text';

export const orderInquiryQuerySchema = z.strictObject({
  search: searchText.max(120).optional(),
  // Position in the list: how many inquiries the earlier pages held.
  cursor: z.coerce.number<string>().int().min(1).max(100000).optional(),
  limit: z.coerce.number<string>().int().min(1).max(100).default(50),
});
export type OrderInquiryQuery = z.infer<typeof orderInquiryQuerySchema>;

export type OrderInquiry = {
  conversationId: string;
  contactId: string;
  contactName: string | null;
  channel: (typeof chatChannels)[number];
  // New: no earlier order. Repeat: has one. Vip: carries the vip tag.
  customerKind: 'new' | 'repeat' | 'vip';
  lastMessageAt: string | null;
  // The product the AI showed last in this chat; null when none was shown or it is gone.
  product: { id: string; name: string; pricePoisha: number | null } | null;
};

export type OrderInquiryPage = { items: OrderInquiry[]; nextCursor: number | null };

// The Orders screen tabs in one response. Pending is orders waiting for an advance payment.
export type OrderTabCounts = Record<
  Exclude<OrderStage, 'cancelled' | 'partially_delivered'> | 'inquiries' | 'pending',
  number
>;
