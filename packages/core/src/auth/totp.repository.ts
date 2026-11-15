import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { users } from '@dakly/db/schema/auth';

import type { EncryptedSecret } from '../platform/crypto/envelope-encryption';
import { AccountDatabase } from '../platform/database/account-database';

@Injectable()
export class TotpRepository {
  constructor(@Inject(AccountDatabase) private readonly database: AccountDatabase) {}
  async enable(
    userId: string,
    envelope: EncryptedSecret,
    backupCodeHashes: string[],
    step: number,
    now: Date,
  ) {
    await this.database.forUser(userId, (tx) =>
      tx
        .update(users)
        .set({
          totpSecretCiphertext: envelope.ciphertext,
          totpKeyVersion: envelope.keyVersion,
          totpEnabledAt: now,
          totpLastStep: step,
          backupCodeHashes,
          securityVersion: sql`${users.securityVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, userId)),
    );
  }
  async disable(userId: string, now: Date) {
    await this.database.forUser(userId, (tx) =>
      tx
        .update(users)
        .set({
          totpSecretCiphertext: null,
          totpKeyVersion: null,
          totpEnabledAt: null,
          totpLastStep: null,
          backupCodeHashes: null,
          securityVersion: sql`${users.securityVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, userId)),
    );
  }
  async consumeBackup(userId: string, hash: string): Promise<boolean> {
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .update(users)
        .set({ backupCodeHashes: sql`array_remove(${users.backupCodeHashes},${hash})` })
        .where(and(eq(users.id, userId), sql`${hash} = any(${users.backupCodeHashes})`))
        .returning({ id: users.id }),
    );
    return rows.length === 1;
  }
  async useStep(userId: string, step: number): Promise<boolean> {
    const rows = await this.database.forUser(userId, (tx) =>
      tx
        .update(users)
        .set({ totpLastStep: step })
        .where(
          and(
            eq(users.id, userId),
            sql`(${users.totpLastStep} is null or ${users.totpLastStep} < ${step})`,
          ),
        )
        .returning({ id: users.id }),
    );
    return rows.length === 1;
  }
}
