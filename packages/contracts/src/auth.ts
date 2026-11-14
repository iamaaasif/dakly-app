import { z } from 'zod';
import { bdMobileSchema } from './phone';

export const signUpSchema = z.strictObject({
  purpose: z.literal('sign_up'),
  name: z.string().trim().min(1).max(120),
  phone: bdMobileSchema,
  email: z.email().max(254).optional(),
  termsVersion: z.string().trim().min(1).max(100),
});
export const requestCodeSchema = z.discriminatedUnion('purpose', [
  signUpSchema,
  z.strictObject({ purpose: z.literal('sign_in'), phone: bdMobileSchema }),
]);
export const verifyCodeSchema = z.strictObject({
  purpose: z.enum(['sign_up', 'sign_in']),
  phone: bdMobileSchema,
  code: z.string().regex(/^\d{6}$/),
  isRemembered: z.boolean().default(false),
});
export type SignUpInput = z.infer<typeof signUpSchema>;
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type CodePurpose =
  'sign_up' | 'sign_in' | 'reset_password' | 'add_email' | 'email_change_proof';

const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const requestEmailCodeSchema = z.strictObject({ email: emailSchema });
export const verifyEmailCodeSchema = requestEmailCodeSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  isRemembered: z.boolean().default(false),
});
export const changeEmailSchema = requestEmailCodeSchema.extend({
  proofCode: z.string().regex(/^\d{6}$/),
});
export const verifyNewEmailSchema = requestEmailCodeSchema.extend({
  code: z.string().regex(/^\d{6}$/),
});
export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>;
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type VerifyNewEmailInput = z.infer<typeof verifyNewEmailSchema>;
