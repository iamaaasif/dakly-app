import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from '@dakly/db/schema/auth';
import type { UserProfile } from '@dakly/contracts/sessions';
import { AccountDatabase } from '../platform/database/account-database';

@Injectable()
export class UsersRepository {
  constructor(@Inject(AccountDatabase) private readonly database: AccountDatabase) {}
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
