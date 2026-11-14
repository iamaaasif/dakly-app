import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from '@dakly/db/uuid-v7';
import type { Database } from '@dakly/db/client';
import type { SignUpInput } from '@dakly/contracts/auth';
import { DATABASE } from '../platform/database/database.tokens';
import { users } from '@dakly/db/schema/auth';
import type { UserProfile } from '@dakly/contracts/sessions';
import { AccountDatabase } from '../platform/database/account-database';
import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(AccountDatabase) private readonly database: AccountDatabase,
    @Inject(DATABASE) private readonly connection: Database,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}

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
          .set({ googleSubject: subject, updatedAt: now })
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
      tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId)),
    );
  }

  async changeEmail(userId: string, email: string, now: Date): Promise<boolean> {
    try {
      await this.database.forUser(userId, (tx) =>
        tx
          .update(users)
          .set({ email, emailVerifiedAt: now, updatedAt: now })
          .where(eq(users.id, userId)),
      );
      return true;
    } catch (error) {
      // The caller maps this known constraint conflict and rolls back the account action.
      if (this.isUniqueConflict(error, 'users_email_key')) return false;
      throw error;
    }
  }

  private isUniqueConflict(error: unknown, constraint: string): boolean {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    return (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === '23505' &&
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
          passwordHash: users.passwordHash,
          googleSubject: users.googleSubject,
        })
        .from(users)
        .where(eq(users.id, userId))
        .for('update')
        .limit(1),
    );
    return rows[0];
  }

  async signedIn(userId: string, now: Date): Promise<void> {
    await this.database.forUser(userId, (tx) =>
      tx.update(users).set({ lastSignInAt: now, updatedAt: now }).where(eq(users.id, userId)),
    );
  }
  async findProfile(userId: string): Promise<UserProfile | undefined> {
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    );
    return rows[0];
  }
}
