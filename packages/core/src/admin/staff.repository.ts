import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  staffUsers,
  staffChallenges,
  staffPasskeys,
  staffSessions,
  staffIdentityContacts,
} from '@dakly/db/schema/admin';
import { uuidv7 } from '@dakly/db/uuid-v7';
import { StaffDatabase } from '../platform/database/staff-database';
import { DATABASE } from '../platform/database/database.tokens';
import type { Database } from '@dakly/db/client';
import type { StaffProvisionInput } from '@dakly/contracts/staff-auth';

const staffColumns = {
  id: staffUsers.id,
  email: staffUsers.email,
  name: staffUsers.name,
  role: staffUsers.role,
  status: staffUsers.status,
  accessSubject: staffUsers.accessSubject,
  passwordHash: staffUsers.passwordHash,
  enrolledAt: staffUsers.enrolledAt,
  failedAttempts: staffUsers.failedAttempts,
  blockedUntil: staffUsers.blockedUntil,
  totpSecretCiphertext: staffUsers.totpSecretCiphertext,
  totpKeyVersion: staffUsers.totpKeyVersion,
  totpLastStep: staffUsers.totpLastStep,
};
const challengeColumns = {
  purpose: staffChallenges.purpose,
  passwordHash: staffChallenges.passwordHash,
  passwordState: staffChallenges.passwordState,
  webauthnChallenge: staffChallenges.webauthnChallenge,
  totpSecretCiphertext: staffChallenges.totpSecretCiphertext,
  totpKeyVersion: staffChallenges.totpKeyVersion,
  expiresAt: staffChallenges.expiresAt,
  consumedAt: staffChallenges.consumedAt,
};
export type StaffChallengeRecord = typeof staffChallenges.$inferInsert;
@Injectable()
export class StaffRepository {
  constructor(
    @Inject(StaffDatabase) private readonly scope: StaffDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}
  async findIdentity(subject: string, email: string) {
    const [row] = await this.database
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(and(eq(staffUsers.accessSubject, subject), eq(staffUsers.email, email)))
      .limit(1);
    return row?.id;
  }
  async lock(staffUserId: string) {
    return this.scope.forStaff(staffUserId, async (tx) => {
      const [row] = await tx
        .select(staffColumns)
        .from(staffUsers)
        .where(eq(staffUsers.id, staffUserId))
        .for('update');
      return row;
    });
  }
  async update(
    staffUserId: string,
    values: Partial<
      Pick<
        typeof staffUsers.$inferInsert,
        | 'passwordHash'
        | 'enrolledAt'
        | 'failedAttempts'
        | 'blockedUntil'
        | 'totpLastStep'
        | 'totpSecretCiphertext'
        | 'totpKeyVersion'
        | 'lastSignInAt'
      >
    >,
  ): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx.update(staffUsers).set(values).where(eq(staffUsers.id, staffUserId)),
    );
  }
  async provision(staffUserId: string, input: StaffProvisionInput): Promise<void> {
    await this.scope.forStaff(staffUserId, async (tx) => {
      await tx.insert(staffUsers).values({
        id: staffUserId,
        email: input.email,
        name: input.name,
        role: input.role,
        accessSubject: input.accessSubject,
      });
      const emails = [...new Set([input.email, ...input.personalEmails])];
      await tx
        .insert(staffIdentityContacts)
        .values([
          { id: uuidv7(), staffUserId, kind: 'phone', value: input.phone },
          ...emails.map((value) => ({ id: uuidv7(), staffUserId, kind: 'email' as const, value })),
        ]);
    });
  }
  async addChallenge(
    staffUserId: string,
    values: Omit<StaffChallengeRecord, 'staffUserId'>,
  ): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx.insert(staffChallenges).values({ ...values, staffUserId }),
    );
  }
  async challenge(staffUserId: string, tokenHash: Buffer) {
    return this.scope.forStaff(staffUserId, async (tx) => {
      const [row] = await tx
        .select(challengeColumns)
        .from(staffChallenges)
        .where(
          and(
            eq(staffChallenges.staffUserId, staffUserId),
            eq(staffChallenges.tokenHash, tokenHash),
          ),
        );
      return row;
    });
  }
  async consume(staffUserId: string, tokenHash: Buffer, now: Date): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx
        .update(staffChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(staffChallenges.staffUserId, staffUserId),
            eq(staffChallenges.tokenHash, tokenHash),
          ),
        ),
    );
  }
  async consumeAll(staffUserId: string, now: Date): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx
        .update(staffChallenges)
        .set({ consumedAt: now })
        .where(
          and(eq(staffChallenges.staffUserId, staffUserId), isNull(staffChallenges.consumedAt)),
        ),
    );
  }
  async passkeys(staffUserId: string) {
    return this.scope.forStaff(staffUserId, (tx) =>
      tx
        .select({
          id: staffPasskeys.credentialId,
          publicKey: staffPasskeys.publicKey,
          counter: staffPasskeys.counter,
        })
        .from(staffPasskeys)
        .where(eq(staffPasskeys.staffUserId, staffUserId)),
    );
  }
  async addPasskey(
    staffUserId: string,
    credential: { id: string; publicKey: Uint8Array; counter: number },
  ): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx.insert(staffPasskeys).values({
        staffUserId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
      }),
    );
  }
  async updateCounter(staffUserId: string, credentialId: string, counter: number): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx
        .update(staffPasskeys)
        .set({ counter })
        .where(
          and(
            eq(staffPasskeys.staffUserId, staffUserId),
            eq(staffPasskeys.credentialId, credentialId),
          ),
        ),
    );
  }
  async revokeSessions(staffUserId: string, now: Date): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx
        .update(staffSessions)
        .set({ revokedAt: now })
        .where(and(eq(staffSessions.staffUserId, staffUserId), isNull(staffSessions.revokedAt))),
    );
  }
  async createSession(
    staffUserId: string,
    values: Omit<typeof staffSessions.$inferInsert, 'staffUserId'>,
  ): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx.insert(staffSessions).values({ ...values, staffUserId }),
    );
  }
  async session(staffUserId: string, sessionId: string, tokenHash: Buffer) {
    return this.scope.forStaff(staffUserId, async (tx) => {
      const [row] = await tx
        .select({
          id: staffSessions.id,
          expiresAt: staffSessions.expiresAt,
          lastSeenAt: staffSessions.lastSeenAt,
          revokedAt: staffSessions.revokedAt,
        })
        .from(staffSessions)
        .where(
          and(
            eq(staffSessions.staffUserId, staffUserId),
            eq(staffSessions.id, sessionId),
            eq(staffSessions.tokenHash, tokenHash),
          ),
        );
      return row;
    });
  }
  async touchSession(staffUserId: string, sessionId: string, now: Date): Promise<void> {
    await this.scope.forStaff(staffUserId, (tx) =>
      tx
        .update(staffSessions)
        .set({ lastSeenAt: sql`greatest(${staffSessions.lastSeenAt}, ${now}::timestamptz)` })
        .where(and(eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.id, sessionId))),
    );
  }
}
