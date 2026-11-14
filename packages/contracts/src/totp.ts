import { z } from 'zod';
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
export const totpRecoveryCodeSchema = z.strictObject({
  phone: bdMobileSchema,
  method: z.enum(['phone', 'email']),
});
export const totpRecoverySchema = z.strictObject({
  phone: bdMobileSchema,
  phoneCode: z.string().regex(/^\d{6}$/),
  emailCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  password: z.string().min(1).max(128).optional(),
});
export const totpRecoveryTokenSchema = z.strictObject({ recoveryId: z.uuid(), token: tokenSchema });
export type TotpSignInInput = z.infer<typeof totpSignInSchema>;
export type TotpSetupInput = z.infer<typeof totpSetupSchema>;
export type TotpConfirmInput = z.infer<typeof totpConfirmSchema>;
export type TotpRecoveryInput = z.infer<typeof totpRecoverySchema>;
export type TotpRecoveryCodeInput = z.infer<typeof totpRecoveryCodeSchema>;
export type TotpRecoveryTokenInput = z.infer<typeof totpRecoveryTokenSchema>;
