import { teamError } from './team.errors';

type InviteState = { status: string; inviteExpiresAt: Date | null };
type Recipient = { invitePhone: string | null; inviteEmail: string | null };
type Identity = {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
};

export function assertOpenInvite(invite: InviteState | undefined, now: Date): void {
  if (
    !invite ||
    invite.status !== 'invited' ||
    !invite.inviteExpiresAt ||
    invite.inviteExpiresAt <= now
  )
    throw teamError('INVITE_INVALID');
}
export function assertInviteRecipient(invite: Recipient, identity: Identity | undefined): void {
  const phoneMatches =
    identity?.phoneVerifiedAt && invite.invitePhone && identity.phone === invite.invitePhone;
  const emailMatches =
    identity?.emailVerifiedAt &&
    invite.inviteEmail &&
    identity.email?.toLowerCase() === invite.inviteEmail.toLowerCase();
  if (!phoneMatches && !emailMatches) throw teamError('INVITE_WRONG_ACCOUNT');
}
