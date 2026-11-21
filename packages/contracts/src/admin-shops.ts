import { z } from 'zod';

import { channelConnectionKinds, channelConnectionStatuses } from './channels';
import { billingCycles } from './billing';
import { builtInRoles, extensions } from './stores';

// A shop's status for staff: a closing or suspended shop shows that, otherwise its subscription status.
export const adminShopStatuses = [
  'trialing',
  'active',
  'past_due',
  'read_only',
  'cancelled',
  'suspended',
  'closing',
] as const;

export const adminShopListQuerySchema = z.strictObject({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(adminShopStatuses).optional(),
  plan: z.string().trim().min(1).max(40).optional(),
  cursor: z
    .string()
    .max(100)
    .refine((value) => {
      const [timestamp, id, ...extra] = value.split('|');
      return (
        extra.length === 0 &&
        z.iso.datetime().safeParse(timestamp).success &&
        z.uuid().safeParse(id).success
      );
    }, 'Invalid shop cursor')
    .optional(),
});
export type AdminShopListQuery = z.infer<typeof adminShopListQuerySchema>;

export type AdminShopStatus = (typeof adminShopStatuses)[number];

export type AdminShopRow = {
  storeId: string;
  name: string;
  slug: string | null;
  ownerName: string | null;
  ownerPhoneMasked: string | null;
  planCode: string | null;
  planName: string | null;
  status: AdminShopStatus;
  mrrPoisha: number;
  createdAt: string;
  lastActiveAt: string | null;
};
export type AdminShopListResponse = { rows: AdminShopRow[]; cursor: string | null };

export type AdminShopDetail = {
  storeId: string;
  name: string;
  slug: string | null;
  status: AdminShopStatus;
  suspendedReason: string | null;
  extensions: (typeof extensions)[number][];
  createdAt: string;
  subscription: {
    planCode: string;
    planName: string;
    billingCycle: (typeof billingCycles)[number];
    status: AdminShopStatus;
    pricePoisha: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string;
    isCancellationScheduled: boolean;
    pastDueSince: string | null;
  } | null;
  team: {
    name: string;
    role: (typeof builtInRoles)[number] | null;
    phoneMasked: string | null;
    lastActiveAt: string | null;
  }[];
  channels: {
    kind: (typeof channelConnectionKinds)[number];
    displayName: string;
    status: (typeof channelConnectionStatuses)[number];
    isAiLive: boolean;
    whatsappQualityRating: string | null;
    connectedAt: string;
  }[];
};
