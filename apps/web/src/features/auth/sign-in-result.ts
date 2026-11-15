import type { GoogleSignInResponse } from '@dakly/contracts/auth';
import { notifySessionChange } from '@/lib/notify-session-change';
export function announceSignIn<Result extends GoogleSignInResponse>(result: Result): Result {
  if (result === undefined) notifySessionChange();
  return result;
}
