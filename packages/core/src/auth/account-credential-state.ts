import { authKey } from './auth-key';

type CredentialState = {
  id: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  googleSubject: string | null;
  totpEnabledAt: Date | null;
  securityVersion: number;
};
export function accountCredentialState(user: CredentialState): string {
  return authKey(
    'account-credentials',
    JSON.stringify([
      user.id,
      user.phone,
      user.phoneVerifiedAt,
      user.email,
      user.emailVerifiedAt,
      user.passwordHash,
      user.googleSubject,
      user.totpEnabledAt,
      user.securityVersion,
    ]),
  );
}
