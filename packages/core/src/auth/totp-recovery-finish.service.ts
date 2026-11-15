import { timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TotpRecoveryTokenInput } from '@dakly/contracts/totp';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { AccountTransaction } from '../platform/database/account-transaction';
import { SessionsService } from '../sessions/sessions.service';
import { accountCredentialState } from './account-credential-state';
import { AccountRecoveryRepository } from './account-recovery.repository';
import { authError } from './auth.errors';
import { recoveryTokenHash } from './totp-recovery-token';
import { TotpRepository } from './totp.repository';
import { TotpService } from './totp.service';
import { UsersRepository } from './users.repository';

@Injectable()
export class TotpRecoveryFinishService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(TotpRepository) private readonly totpRepository: TotpRepository,
    @Inject(AccountRecoveryRepository) private readonly repository: AccountRecoveryRepository,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async cancelPending(userId: string, ip?: string) {
    const cancelled = await this.repository.cancelPending(userId);
    // A single account has at most one pending request; this also repairs older duplicates.
    await Promise.all(
      cancelled.map((row) =>
        this.events.record(userId, {
          event: 'recovery.cancelled',
          actor: { kind: 'user' },
          ip,
          details: { recoveryId: row.id },
        }),
      ),
    );
  }

  async cancel(input: TotpRecoveryTokenInput, ip: string) {
    const userId = await this.repository.identify(input.recoveryId);
    if (!userId) throw authError('AUTH_TOTP_INVALID');
    await this.transaction.run(userId, async () => {
      await this.users.lockForSignIn(userId);
      const recovery = await this.repository.read(userId, input.recoveryId);
      if (!recovery || !this.matches(input.token, recovery.cancelHash))
        throw authError('AUTH_TOTP_INVALID');
      if (recovery.status === 'pending') await this.cancelPending(userId, ip);
    });
  }

  async complete(input: TotpRecoveryTokenInput, ip: string) {
    const userId = await this.repository.identify(input.recoveryId);
    if (!userId) throw authError('AUTH_TOTP_INVALID');
    await this.transaction.run(userId, async () => {
      const user = await this.totp.current(userId);
      const recovery = await this.repository.read(userId, input.recoveryId);
      if (
        !recovery ||
        recovery.status !== 'pending' ||
        !this.matches(input.token, recovery.completionHash) ||
        recovery.credentialState !== accountCredentialState(user)
      )
        throw authError('AUTH_TOTP_INVALID');
      if (!recovery.eligibleAt || recovery.eligibleAt > this.clock.now())
        throw authError('AUTH_RECOVERY_PENDING');
      await this.totpRepository.disable(userId, this.clock.now());
      await this.sessions.revokeAll(userId, ip);
      await this.repository.finish(userId, recovery.id);
      await this.events.record(userId, {
        event: 'recovery.completed',
        actor: { kind: 'user' },
        ip,
        details: { recoveryId: recovery.id },
      });
    });
  }

  private matches(token: string, expected: string) {
    return timingSafeEqual(Buffer.from(recoveryTokenHash(token)), Buffer.from(expected));
  }
}
