import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { uuidv7 } from '@dakly/db/uuid-v7';
import type { Database } from '@dakly/db/client';
import type { SignUpInput } from '@dakly/contracts/auth';
import { accountRecoveries } from '@dakly/db/schema/account-recovery';
import { users } from '@dakly/db/schema/auth';
import type { AccountProfile, UserProfile } from '@dakly/contracts/sessions';
import { databaseErrorCode } from '../platform/database/error-code';
import { DATABASE } from '../platform/database/database.tokens';
import { AccountDatabase } from '../platform/database/account-database';
import { TenantDatabase, type Transaction } from '../platform/database/tenant-database';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(AccountDatabase) private readonly database: AccountDatabase,
    @Inject(DATABASE) private readonly connection: Database,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}

  async recoveryTarget(identifier: string) {
    const [user] = await this.connection
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          and(eq(users.phone, identifier), isNotNull(users.phoneVerifiedAt)),
          and(eq(users.email, identifier), isNotNull(users.emailVerifiedAt)),
        ),
      )
      .limit(1);
    return user?.id;
  }
  async recover(
    userId: string,
    changes: { removeTotp: boolean; newPhone?: string; newEmail?: string },
    now: Date,
  ) {
    try {
      await this.database.inTransaction(userId, async (tx) => {
        await this.lockIdentityContacts(tx, userId, changes.newPhone, changes.newEmail);
        await tx
          .update(users)
          .set({
            ...(changes.newPhone ? { phone: changes.newPhone, phoneVerifiedAt: now } : {}),
            ...(changes.newEmail ? { email: changes.newEmail, emailVerifiedAt: now } : {}),
            ...(changes.removeTotp
              ? {
                  totpSecretCiphertext: null,
                  totpKeyVersion: null,
                  totpEnabledAt: null,
                  totpLastStep: null,
                  backupCodeHashes: null,
                }
              : {}),
            securityVersion: sql`${users.securityVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
        await tx
          .update(accountRecoveries)
          .set({ status: 'cancelled' })
          .where(
            and(eq(accountRecoveries.userId, userId), eq(accountRecoveries.status, 'pending')),
          );
      });
      return true;
    } catch (error) {
      if (
        this.isUniqueConflict(error, 'users_phone_key') ||
        this.isUniqueConflict(error, 'users_email_key')
      )
        return false;
      throw error;
    }
  }

  async lockAccount(userId: string): Promise<void> {
    await this.database.forUser(userId, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('no key update')
        .limit(1),
    );
  }
  async invalidateChallenges(userId: string) {
    await this.database.forUser(userId, (tx) =>
      tx
        .update(users)
        .set({ securityVersion: sql`${users.securityVersion} + 1` })
        .where(eq(users.id, userId)),
    );
  }

  async profiles(userIds: string[]): Promise<UserProfile[]> {
    if (userIds.length === 0) return [];
    if (userIds.length > 100) throw new Error('Account profile batch exceeds 100');
    return this.connection
      .select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds))
      .limit(100);
  }

  async verifiedRecipient(
    storeId: string,
    input: { phone?: string; email?: string },
  ): Promise<string | undefined> {
    // Invitation checks reuse the store action's connection while it holds the row lock.
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(
          input.phone
            ? and(eq(users.phone, input.phone), isNotNull(users.phoneVerifiedAt))
            : and(eq(users.email, input.email!), isNotNull(users.emailVerifiedAt)),
        )
        .limit(1),
    );
    return row?.id;
  }

  async lockVerifiedIdentity(storeId: string, userId: string) {
    // Store actions hold current identity stable before locking the store; this never writes an account.
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          phone: users.phone,
          phoneVerifiedAt: users.phoneVerifiedAt,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isDisabled, false)))
        .for('share')
        .limit(1),
    );
    return row;
  }

  allocateId(): string {
    return uuidv7();
  }

  async findByPhone(phone: string) {
    // The indexed identifier lookup establishes the identity before account scoping.
    const rows = await this.connection
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return rows[0];
  }

  async findByVerifiedEmail(email: string) {
    const rows = await this.connection
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(and(eq(users.email, email), isNotNull(users.emailVerifiedAt)))
      .limit(1);
    return rows[0];
  }

  async findByGoogleSubject(subject: string) {
    const rows = await this.connection
      .select({ id: users.id })
      .from(users)
      .where(eq(users.googleSubject, subject))
      .limit(1);
    return rows[0];
  }

  async linkGoogle(userId: string, subject: string, now: Date): Promise<boolean> {
    try {
      await this.database.forUser(userId, (tx) =>
        tx
          .update(users)
          .set({
            googleSubject: subject,
            securityVersion: sql`${users.securityVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, userId)),
      );
      return true;
    } catch (error) {
      if (this.isUniqueConflict(error, 'users_google_subject_key')) return false;
      throw error;
    }
  }

  async hasUnverifiedEmail(email: string): Promise<boolean> {
    const rows = await this.connection
      .select({ exists: sql<boolean>`true` })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.emailVerifiedAt)))
      .limit(1);
    return rows.length > 0;
  }

  async changePassword(userId: string, passwordHash: string, now: Date): Promise<void> {
    await this.database.forUser(userId, (tx) =>
      tx
        .update(users)
        .set({ passwordHash, securityVersion: sql`${users.securityVersion} + 1`, updatedAt: now })
        .where(eq(users.id, userId)),
    );
  }

  async changeEmail(userId: string, email: string, now: Date): Promise<boolean> {
    try {
      await this.database.forUser(userId, async (tx) => {
        await this.lockIdentityContacts(tx, userId, undefined, email);
        await tx
          .update(users)
          .set({
            email,
            emailVerifiedAt: now,
            securityVersion: sql`${users.securityVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
      });
      return true;
    } catch (error) {
      // The caller maps this known constraint conflict and rolls back the account action.
      if (this.isUniqueConflict(error, 'users_email_key')) return false;
      throw error;
    }
  }

  private async lockIdentityContacts(
    tx: Transaction,
    userId: string,
    phone?: string,
    email?: string,
  ) {
    // Contact UPDATE upgrades the user lock; take all trigger keys while FK checks can still finish.
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtextextended('staff-identity:' || kind || ':' || value, 0))
      from (
        select distinct kind, value
        from users u
        cross join lateral (
          values
            ('phone', case when u.phone_verified_at is not null then u.phone end),
            ('email', case when u.email_verified_at is not null then lower(u.email::text) end),
            ('phone', ${phone ?? null}::text),
            ('email', ${email ?? null}::text)
        ) contacts(kind, value)
        where u.id=${userId}::uuid
          and value is not null
      ) identities
      order by kind, value
    `);
  }

  private isUniqueConflict(error: unknown, constraint: string): boolean {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    return (
      typeof cause === 'object' &&
      cause !== null &&
      databaseErrorCode(error) === '23505' &&
      'constraint' in cause &&
      cause.constraint === constraint
    );
  }

  async create(
    userId: string,
    input: SignUpInput,
    now: Date,
    passwordHash?: string,
    google?: GoogleIdentity,
  ): Promise<boolean> {
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .insert(users)
        .values({
          id: userId,
          name: input.name,
          passwordHash,
          phone: input.phone,
          email: google?.email ?? input.email,
          emailVerifiedAt: google ? now : undefined,
          googleSubject: google?.subject,
          phoneVerifiedAt: now,
          termsVersion: input.termsVersion,
          termsAcceptedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: users.id }),
    );
    return rows.length === 1;
  }

  async lockForSignIn(userId: string) {
    // Serialize account decisions while allowing staff association foreign-key checks.
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .select({
          id: users.id,
          phone: users.phone,
          phoneVerifiedAt: users.phoneVerifiedAt,
          email: users.email,
          emailVerifiedAt: users.emailVerifiedAt,
          isDisabled: users.isDisabled,
          totpEnabledAt: users.totpEnabledAt,
          totpSecretCiphertext: users.totpSecretCiphertext,
          totpKeyVersion: users.totpKeyVersion,
          totpLastStep: users.totpLastStep,
          securityVersion: users.securityVersion,
          backupCodeHashes: users.backupCodeHashes,
          passwordHash: users.passwordHash,
          googleSubject: users.googleSubject,
        })
        .from(users)
        .where(eq(users.id, userId))
        .for('no key update')
        .limit(1),
    );
    return rows[0];
  }

  async signedIn(userId: string, now: Date): Promise<void> {
    await this.database.forUser(userId, (tx) =>
      tx.update(users).set({ lastSignInAt: now, updatedAt: now }).where(eq(users.id, userId)),
    );
  }
  async findProfile(userId: string): Promise<AccountProfile | undefined> {
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          email: users.email,
          hasPassword: sql<boolean>`${users.passwordHash} is not null`,
          isPhoneVerified: sql<boolean>`${users.phoneVerifiedAt} is not null`,
          isEmailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
          isTotpEnabled: sql<boolean>`${users.totpEnabledAt} is not null`,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    );
    return rows[0];
  }
}
