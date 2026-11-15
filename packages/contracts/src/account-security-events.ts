import { z } from 'zod';

export const accountSecurityEventTypes = [
  'password.changed',
  'totp.enabled',
  'totp.disabled',
  'recovery.started',
  'recovery.cancelled',
  'recovery.completed',
  'email.changed',
  'phone.changed',
  'sessions.revoked',
  'google.linked',
] as const;
export const accountRecoveryReasons = ['lost_phone', 'lost_authenticator', 'lost_email'] as const;
export const accountSecurityActorTypes = ['user', 'system', 'staff'] as const;

export const accountSecurityEventSchema = z.strictObject({
  event: z.enum(accountSecurityEventTypes),
  actor: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('user') }),
    z.strictObject({ kind: z.literal('system') }),
    z.strictObject({
      kind: z.literal('staff'),
      staffId: z.uuid(),
      reasonType: z.enum(accountRecoveryReasons),
    }),
  ]),
  ip: z.union([z.ipv4(), z.ipv6()]).optional(),
  userAgent: z.string().max(512).optional(),
  details: z
    .strictObject({ sessionId: z.uuid().optional(), recoveryId: z.uuid().optional() })
    .optional(),
});
export type AccountSecurityEvent = z.infer<typeof accountSecurityEventSchema>;
export const accountSecurityHistorySchema = z.strictObject({
  before: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type AccountSecurityHistory = z.infer<typeof accountSecurityHistorySchema>;

export type AccountSecurityHistoryPage = {
  items: {
    id: string;
    event: (typeof accountSecurityEventTypes)[number];
    actorType: (typeof accountSecurityActorTypes)[number];
    reasonType: (typeof accountRecoveryReasons)[number] | null;
    createdAt: string;
  }[];
  nextCursor: string | null;
};
