import { z } from 'zod';
export const staffAuditSearchSchema = z.strictObject({
  action: z.string().trim().max(80).optional(),
  staffUserId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
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
    }, 'Invalid audit cursor')
    .optional(),
});
export const staffAuditExportSchema = z.strictObject({
  filter: staffAuditSearchSchema.omit({ cursor: true }),
  reason: z.string().trim().min(10).max(1000),
});
export type StaffAuditSearch = z.infer<typeof staffAuditSearchSchema>;
export type StaffAuditRow = {
  id: string;
  staffUserId: string | null;
  actorUserId: string | null;
  operatorIdentity: string | null;
  action: string;
  storeId: string | null;
  targetType: string | null;
  targetId: string | null;
  reason: string;
  actionDetails: unknown;
  ip: string | null;
  createdAt: string;
};
export type StaffAuditPage = { rows: StaffAuditRow[]; cursor: string | null };
export type StaffAuditExportResponse = {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  progress: number;
  expiresAt: string;
  error: string | null;
};

export type TenantStaffAudit = {
  actor: { kind: 'staff'; staffUserId: string } | { kind: 'user'; userId: string };
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  ip?: string;
  actionDetails?: Record<string, unknown>;
};
