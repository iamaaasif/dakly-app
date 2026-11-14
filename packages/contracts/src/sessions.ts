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

export const sessionListSchema = z.strictObject({ before: z.uuid().optional() });
export const sessionIdSchema = z.uuid();

export type AccountProfile = UserProfile & {
  hasPassword: boolean;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isTotpEnabled: boolean;
};

export type SessionContext = {
  user: Pick<UserProfile, 'id' | 'name'>;
  stores: UserStore[];
  currentStore:
    | (UserStore & {
        canViewCustomers: boolean;
        canCreateCustomer: boolean;
        canApproveSupport: boolean;
        canViewTeam: boolean;
        canEditTeam: boolean;
        canTransferOwnership: boolean;
      })
    | null;
  contextTag: string;
};
