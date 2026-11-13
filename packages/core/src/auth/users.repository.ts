import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { uuidv7 } from '@dakly/db/uuid-v7';
import type { Database } from '@dakly/db/client';
import type { SignUpInput } from '@dakly/contracts/auth';
import { DATABASE } from '../platform/database/database.tokens';
import { users } from '@dakly/db/schema/auth';
import type { UserProfile } from '@dakly/contracts/sessions';
import { AccountDatabase } from '../platform/database/account-database';

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(AccountDatabase) private readonly database: AccountDatabase,
    @Inject(DATABASE) private readonly connection: Database,
  ) {}

  allocateId(): string {
    return uuidv7();
  }

  async findByPhone(phone: string) {
    // The indexed identifier lookup establishes the identity before account scoping.
    const rows = await this.connection
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return rows[0];
  }

  async create(userId: string, input: SignUpInput, now: Date): Promise<boolean> {
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .insert(users)
        .values({
          id: userId,
          name: input.name,
          phone: input.phone,
          email: input.email,
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
          isDisabled: users.isDisabled,
          totpEnabledAt: users.totpEnabledAt,
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
