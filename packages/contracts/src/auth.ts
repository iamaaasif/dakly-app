import { z } from 'zod';
import { bdMobileSchema } from './phone';
export const passwordSchema = z.string().min(8).max(128).regex(/[0-9]/);

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
export const verifyCodeSchema = z
  .strictObject({
    purpose: z.enum(['sign_up', 'sign_in']),
    password: passwordSchema.optional(),
    signupTicket: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    phone: bdMobileSchema,
    code: z.string().regex(/^\d{6}$/),
    isRemembered: z.boolean().default(false),
  })
  .refine(
    (input) =>
      input.purpose === 'sign_up' ||
      (input.password === undefined && input.signupTicket === undefined),
    {
      path: ['password'],
      message: 'Password is only accepted during signup',
    },
  );
export type SignUpInput = z.infer<typeof signUpSchema>;
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type CodePurpose =
  | 'totp_setup'
  | 'totp_recovery_phone'
  | 'totp_recovery_email'
  | 'google_email'
  | 'sign_up'
  | 'sign_in'
  | 'reset_password'
  | 'add_email'
  | 'email_change_proof'
  | 'password_change_proof'
  | 'ownership_transfer'
  | 'support_approval'
  | 'staff_recovery_phone'
  | 'staff_recovery_email';

const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const requestEmailCodeSchema = z.strictObject({ email: emailSchema });
export const verifyEmailCodeSchema = requestEmailCodeSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  isRemembered: z.boolean().default(false),
});
export const changeEmailSchema = z.union([
  requestEmailCodeSchema.extend({ proofCode: z.string().regex(/^\d{6}$/) }),
  requestEmailCodeSchema.extend({ currentPassword: z.string().min(1).max(128) }),
]);
export const verifyNewEmailSchema = requestEmailCodeSchema.extend({
  code: z.string().regex(/^\d{6}$/),
});
export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>;
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type VerifyNewEmailInput = z.infer<typeof verifyNewEmailSchema>;

const currentPasswordSchema = z.string().min(1).max(128);
export const passwordIdentifierSchema = z.strictObject({
  identifier: z.union([bdMobileSchema, emailSchema]),
});
export const passwordSignInSchema = passwordIdentifierSchema.extend({
  password: currentPasswordSchema,
  isRemembered: z.boolean().default(false),
});
export const confirmPasswordResetSchema = passwordIdentifierSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  password: passwordSchema,
  isRemembered: z.boolean().default(false),
});
export const changePasswordSchema = z.union([
  z.strictObject({ password: passwordSchema, currentPassword: currentPasswordSchema }),
  z.strictObject({ password: passwordSchema, proofCode: z.string().regex(/^\d{6}$/) }),
]);
export const requestPasswordProofSchema = z.strictObject({});
export type PasswordIdentifierInput = z.infer<typeof passwordIdentifierSchema>;
export type PasswordSignInInput = z.infer<typeof passwordSignInSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const googleSignInSchema = z.strictObject({
  idToken: z.string().min(1).max(16384),
  isRemembered: z.boolean().default(false),
});
export const verifyGoogleEmailSchema = z.strictObject({
  verificationTicket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().regex(/^\d{6}$/),
  isRemembered: z.boolean().default(false),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;
export type VerifyGoogleEmailInput = z.infer<typeof verifyGoogleEmailSchema>;
export type GoogleSignInPending =
  | { status: 'signup_required'; signupTicket: string }
  | { status: 'email_verification_required'; verificationTicket: string };
