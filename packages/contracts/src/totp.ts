import { z } from 'zod';

import { emailSchema } from './auth';
import { bdMobileSchema } from './phone';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const codeSchema = z.string().regex(/^(\d{6}|[a-f0-9]{20})$/);
export const totpSignInSchema = z.strictObject({ challengeId: tokenSchema, code: codeSchema });
export const totpSetupSchema = z.union([
  z.strictObject({ currentPassword: z.string().min(1).max(128) }),
  z.strictObject({ proofCode: z.string().regex(/^\d{6}$/) }),
]);
export const totpConfirmSchema = z.strictObject({
  setupId: tokenSchema,
  code: z.string().regex(/^\d{6}$/),
});
export const totpDisableSchema = z.strictObject({ code: codeSchema });
// An account with no verified phone (Google sign-up) recovers through its verified email alone.
const recoveryIdentifier = { phone: bdMobileSchema.optional(), email: emailSchema.optional() };
const hasOneIdentifier = (input: { phone?: string; email?: string }) =>
  (input.phone === undefined) !== (input.email === undefined);
export const totpRecoveryCodeSchema = z
  .strictObject({ ...recoveryIdentifier, method: z.enum(['phone', 'email']) })
  .refine((input) => hasOneIdentifier(input) && (input.method === 'email' || !input.email), {
    message: 'Use one mobile number or one email',
  });
export const totpRecoveryFieldsSchema = z.strictObject({
  ...recoveryIdentifier,
  phoneCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  emailCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  password: z.string().min(1).max(128).optional(),
});
export const totpRecoverySchema = totpRecoveryFieldsSchema.refine(
  (input) =>
    hasOneIdentifier(input) &&
    (input.phone === undefined ? input.emailCode !== undefined : input.phoneCode !== undefined),
  { message: 'Enter the code sent to your mobile number or email' },
);
export const totpRecoveryTokenSchema = z.strictObject({ recoveryId: z.uuid(), token: tokenSchema });
export type TotpSignInInput = z.infer<typeof totpSignInSchema>;
export type TotpSetupInput = z.infer<typeof totpSetupSchema>;
export type TotpConfirmInput = z.infer<typeof totpConfirmSchema>;
export type TotpRecoveryInput = z.infer<typeof totpRecoverySchema>;
export type TotpRecoveryCodeInput = z.infer<typeof totpRecoveryCodeSchema>;
export type TotpRecoveryTokenInput = z.infer<typeof totpRecoveryTokenSchema>;

export type TotpRecoveryResponse = {
  recoveryId: string;
  completionToken: string;
  eligibleAt: string | null;
};

export type TotpDisableInput = z.infer<typeof totpDisableSchema>;
export type TotpSetupResponse = { setupId: string; uri: string };
export type TotpConfirmResponse = { backupCodes: string[] };
