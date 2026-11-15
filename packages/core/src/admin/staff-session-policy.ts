export const STAFF_IDLE_MS = 30 * 60 * 1000;
export const STAFF_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function isStaffSessionCurrent(
  session: { revokedAt: Date | null; expiresAt: Date; lastSeenAt: Date | null },
  now: Date,
): boolean {
  return (
    !session.revokedAt &&
    session.expiresAt > now &&
    Boolean(session.lastSeenAt && session.lastSeenAt.getTime() + STAFF_IDLE_MS > now.getTime())
  );
}
