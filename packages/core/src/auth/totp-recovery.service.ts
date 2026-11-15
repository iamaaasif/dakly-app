import { randomBytes } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { TotpRecoveryCodeInput, TotpRecoveryInput } from '@dakly/contracts/totp';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { AccountTransaction } from '../platform/database/account-transaction';
import { QUEUES } from '../platform/queue/queues';
import { TeamService } from '../team/team.service';
import { accountCredentialState } from './account-credential-state';
import { AccountRecoveryRepository } from './account-recovery.repository';
import { authError } from './auth.errors';
import { securityNoticeJob } from './jobs/send-security-notice.job';
import { PasswordCredentials } from './password-credentials';
import { SecurityNoticesService, type SecurityNotice } from './security-notices.service';
import { SignInCodes } from './sign-in-codes';
import { TotpRecoveryFinishService } from './totp-recovery-finish.service';
import { recoveryTokenHash } from './totp-recovery-token';
import { TotpService } from './totp.service';
import { UsersRepository } from './users.repository';

@Injectable()
export class TotpRecoveryService {
  private readonly logger = new Logger(TotpRecoveryService.name);
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(PasswordCredentials) private readonly passwords: PasswordCredentials,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(AccountRecoveryRepository) private readonly repository: AccountRecoveryRepository,
    @Inject(SecurityNoticesService) private readonly notices: SecurityNoticesService,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.transactional) private readonly queue: Queue,
    @Inject(TotpRecoveryFinishService) private readonly finish: TotpRecoveryFinishService,
  ) {}

  private async account(phone: string) {
    const identity = await this.users.findByPhone(phone);
    if (!identity) throw authError('AUTH_PROOF_REQUIRED');
    const user = await this.totp.current(identity.id);
    if (!user.totpEnabledAt || !user.phoneVerifiedAt || user.phone !== phone)
      throw authError('AUTH_PROOF_REQUIRED');
    return user;
  }

  private subject(
    user: Awaited<ReturnType<TotpRecoveryService['account']>>,
    method: 'phone' | 'email',
  ) {
    const email =
      method === 'email' && user.emailVerifiedAt ? (user.email ?? undefined) : undefined;
    if (method === 'email' && !email) throw authError('AUTH_PROOF_REQUIRED');
    return {
      target: email ?? user.phone!,
      phone: user.phone!,
      email,
      userId: user.id,
      binding: user.id,
    };
  }

  async requestCode(input: TotpRecoveryCodeInput, ip: string) {
    const user = await this.account(input.phone);
    await this.codes.send({
      subject: this.subject(user, input.method),
      purpose: input.method === 'phone' ? 'totp_recovery_phone' : 'totp_recovery_email',
      ip,
      proof: {
        ...this.passwords.proof(user.id, user.passwordHash),
        identifierState: accountCredentialState(user),
      },
    });
  }

  async start(input: TotpRecoveryInput, ip: string) {
    const user = await this.account(input.phone);
    if ((user.emailVerifiedAt && !input.emailCode) || (user.passwordHash && !input.password))
      throw authError('AUTH_PROOF_REQUIRED');
    const state = accountCredentialState(user);
    const phoneGrant = await this.codes.consume(
      this.subject(user, 'phone'),
      'totp_recovery_phone',
      input.phoneCode,
      ip,
    );
    this.assertProof(phoneGrant, user.id, state);
    if (user.emailVerifiedAt)
      this.assertProof(
        await this.codes.consume(
          this.subject(user, 'email'),
          'totp_recovery_email',
          input.emailCode!,
          ip,
        ),
        user.id,
        state,
      );
    if (user.passwordHash)
      this.passwords.assertCurrent(
        user.id,
        user.passwordHash,
        await this.passwords.check(this.totp.subject(user), input.password!, ip),
      );
    const cancelToken = randomBytes(32).toString('base64url');
    const completionToken = randomBytes(32).toString('base64url');
    let noticeIds: string[] = [];
    const recoveryId = await this.transaction.run(user.id, async () => {
      const current = await this.totp.current(user.id);
      if (accountCredentialState(current) !== state) throw authError('AUTH_PROOF_REQUIRED');
      const owners = await this.team.accountOwnerContacts(user.id);
      if (owners.length > 1000) throw authError('AUTH_RECOVERY_OWNER_LIMIT');
      await this.finish.cancelPending(user.id, ip);
      const id = await this.repository.start(user.id, {
        credentialState: state,
        cancelHash: recoveryTokenHash(cancelToken),
        completionHash: recoveryTokenHash(completionToken),
      });
      noticeIds = await this.notices.enqueue(
        user.id,
        this.deliveries(current, owners, id, cancelToken),
        id,
      );
      await this.events.record(user.id, {
        event: 'recovery.started',
        actor: { kind: 'user' },
        ip,
        details: { recoveryId: id },
      });
      return id;
    });
    await this.sendNotices(noticeIds);
    const recovery = await this.repository.read(user.id, recoveryId);
    return { recoveryId, completionToken, eligibleAt: recovery?.eligibleAt ?? null };
  }

  // The notices are already stored, so a queue outage leaves them for the scheduled sweep.
  private async sendNotices(noticeIds: string[]) {
    try {
      await this.queue.addBulk(noticeIds.map(securityNoticeJob));
    } catch {
      this.logger.error({ event: 'security' }, 'Account security notice queueing failed');
    }
  }

  private deliveries(
    current: Awaited<ReturnType<TotpService['current']>>,
    owners: Awaited<ReturnType<TeamService['accountOwnerContacts']>>,
    id: string,
    cancelToken: string,
  ): SecurityNotice[] {
    const link = `${loadEnv().WEB_ORIGINS[0]}/security/recovery#recoveryId=${id}&cancelToken=${cancelToken}`;
    const text = `Dakly two-step verification recovery was requested. It can finish only seven days after all security notices are delivered. If this was not you, cancel: ${link}`;
    const deliveries: SecurityNotice[] = [{ channel: 'sms', to: current.phone!, text }];
    if (current.emailVerifiedAt && current.email)
      deliveries.push({ channel: 'email', to: current.email, text });
    for (const owner of owners) {
      if (owner.email) deliveries.push({ channel: 'email', to: owner.email, text });
      else if (owner.phone) deliveries.push({ channel: 'sms', to: owner.phone, text });
      else throw authError('AUTH_RECOVERY_CONTACT_REQUIRED');
    }
    return [
      ...new Map(
        deliveries.map((notice) => [`${notice.channel}:${notice.to.toLowerCase()}`, notice]),
      ).values(),
    ];
  }

  private assertProof(
    grant: Awaited<ReturnType<SignInCodes['consume']>>,
    userId: string,
    state: string,
  ) {
    if (
      grant.userId !== userId ||
      !grant.proof ||
      !('identifierState' in grant.proof) ||
      grant.proof.identifierState !== state ||
      grant.proof.expiresAt <= this.clock.now().getTime()
    )
      throw authError('AUTH_PROOF_REQUIRED');
  }
}
