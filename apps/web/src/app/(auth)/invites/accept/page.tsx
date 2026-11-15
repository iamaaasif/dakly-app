import { InviteEntry } from './invite-entry';
import { webAuthConfig } from '@/platform/config/env';

export const dynamic = 'force-dynamic';
export const metadata = { referrer: 'no-referrer' };
// Public invitation entry authenticates the recipient before its explicit account mutation.
export default function InvitePage() {
  return <InviteEntry config={webAuthConfig()} />;
}
