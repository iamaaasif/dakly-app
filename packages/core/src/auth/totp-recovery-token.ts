import { authKey } from './auth-key';

export function recoveryTokenHash(token: string) {
  return authKey('totp-recovery-token', token);
}
