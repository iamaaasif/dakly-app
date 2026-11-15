import { z } from 'zod';

const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,79}$/);
const change = z.strictObject({
  ids: z.array(z.uuid()).max(100).optional(),
  changedFields: z.array(identifier).max(100).optional(),
  support: z
    .strictObject({
      isBreakGlass: z.literal(true),
      access: z.literal('read'),
      scopes: z.tuple([z.literal('customers')]),
      reason: z.string().min(10).max(1000),
      category: z.enum(['security_incident', 'legal_request']),
      expiresAt: z.iso.datetime(),
    })
    .optional(),
});

export const auditEntrySchema = z.strictObject({
  actor: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('user'), userId: z.uuid() }),
    z.strictObject({ kind: z.literal('system') }),
    z.strictObject({ kind: z.literal('staff'), staffUserId: z.uuid() }),
  ]),
  action: identifier,
  entityType: identifier,
  entityId: z.uuid(),
  before: change.optional(),
  after: change.optional(),
  ip: z.union([z.ipv4(), z.ipv6()]).optional(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
