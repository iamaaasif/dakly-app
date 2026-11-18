import { z } from 'zod';

export const activeStoreSchema = z.strictObject({ storeId: z.uuid() });
export type ActiveStoreInput = z.infer<typeof activeStoreSchema>;
export type Session = {
  id: string;
  userId: string;
  activeStoreId: string | null;
  isRemembered: boolean;
  lastSeenAt: Date;
  expiresAt: Date;
};
export type CreateSessionInput = { isRemembered: boolean; ip?: string; userAgent?: string };
export type UserProfile = { id: string; name: string; phone: string | null; email: string | null };
export type UserStore = { storeId: string; name: string };
export const userStorePageSchema = z.strictObject({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type UserStorePageQuery = z.infer<typeof userStorePageSchema>;
export type UserStorePage = { items: UserStore[]; nextCursor: string | null };

export const sessionListSchema = z.strictObject({ before: z.uuid().optional() });
export type SessionListQuery = z.infer<typeof sessionListSchema>;
export const sessionIdSchema = z.uuid();

export type AccountProfile = UserProfile & {
  hasPassword: boolean;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isTotpEnabled: boolean;
};

export type SessionContext = {
  user: Pick<UserProfile, 'id' | 'name'>;
  hasMemberships: boolean;
  currentStore:
    | (UserStore & {
        canViewProducts: boolean;
        canEditProducts: boolean;
        canViewOrders: boolean;
        canEditOrders: boolean;
        canViewCustomers: boolean;
        canCreateCustomer: boolean;
        canViewSegments: boolean;
        canEditSegments: boolean;
        canApproveSupport: boolean;
        canViewStoreSettings: boolean;
        canEditStoreSettings: boolean;
        canChangeExtensions: boolean;
        canViewTeam: boolean;
        canEditTeam: boolean;
        canTransferOwnership: boolean;
      })
    | null;
  contextTag: string;
};

export type DeviceSession = {
  id: string;
  isRemembered: boolean;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  device: string;
  isCurrent: boolean;
};
export type DeviceSessionPage = { items: DeviceSession[]; nextCursor: string | null };
