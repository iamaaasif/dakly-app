import { z } from 'zod';
import { passwordSchema } from './auth';
import { staffRoles } from './admin';
import { bdMobileSchema } from './phone';

const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const staffSignInSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const staffEnrollmentSchema = z.strictObject({
  proof,
  password: passwordSchema,
  factor: z.enum(['totp', 'passkey']),
});
export const staffTotpSchema = z.strictObject({
  challenge: proof,
  code: z.string().regex(/^\d{6}$/),
});
const encoded = z
  .string()
  .min(1)
  .max(20000)
  .regex(/^[A-Za-z0-9_-]+$/);
const transports = z
  .array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']))
  .max(10);
const credential = z.object({
  id: encoded,
  rawId: encoded,
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.object({
    credProps: z.object({ rk: z.boolean().optional() }).optional(),
  }),
});
export const staffRegistrationSchema = z.strictObject({
  challenge: proof,
  credential: credential.extend({
    response: z.object({
      clientDataJSON: encoded,
      attestationObject: encoded,
      transports: transports.optional(),
      publicKeyAlgorithm: z.number().int().optional(),
      publicKey: encoded.optional(),
      authenticatorData: encoded.optional(),
    }),
  }),
});
export const staffAuthenticationSchema = z.strictObject({
  challenge: proof,
  credential: credential.extend({
    response: z.object({
      clientDataJSON: encoded,
      authenticatorData: encoded,
      signature: encoded,
      userHandle: encoded.optional(),
    }),
  }),
});
export const staffProvisionSchema = z.strictObject({
  operatorIdentity: z.string().trim().min(3).max(255),
  email,
  name: z.string().trim().min(1).max(120),
  role: z.enum(staffRoles),
  accessSubject: z.string().min(1).max(255),
  phone: bdMobileSchema,
  personalEmails: z.array(email).min(1).max(10),
  reason: z.string().trim().min(10).max(1000),
});
export type StaffSignInInput = z.infer<typeof staffSignInSchema>;
export type StaffEnrollmentInput = z.infer<typeof staffEnrollmentSchema>;
export type StaffTotpInput = z.infer<typeof staffTotpSchema>;
export type StaffRegistrationInput = z.infer<typeof staffRegistrationSchema>;
export type StaffAuthenticationInput = z.infer<typeof staffAuthenticationSchema>;
export type StaffProvisionInput = z.infer<typeof staffProvisionSchema>;
export type StaffIdentity = { id: string; name: string; role: (typeof staffRoles)[number] };
export type PasskeyRequestOptions = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: 'required' | 'preferred' | 'discouraged';
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: z.infer<typeof transports>;
  }>;
};
export type PasskeyCreationOptions = {
  challenge: string;
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout?: number;
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  authenticatorSelection?: {
    residentKey?: 'discouraged' | 'preferred' | 'required';
    requireResidentKey?: boolean;
    userVerification?: 'required' | 'preferred' | 'discouraged';
    authenticatorAttachment?: 'platform' | 'cross-platform';
  };
  excludeCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: z.infer<typeof transports>;
  }>;
};
export type StaffChallenge = {
  challenge: string;
  factors: Array<'totp' | 'passkey'>;
  passkey?: PasskeyRequestOptions;
};
export type StaffEnrollment = {
  challenge: string;
  totp?: { secret: string; uri: string };
  passkey?: PasskeyCreationOptions;
};
