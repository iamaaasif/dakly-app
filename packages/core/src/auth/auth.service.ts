import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Clock } from '../platform/clock';
import { AccountTransaction } from '../platform/database/account-transaction';
import { QUEUES } from '../platform/queue/queues';
import { SessionsService } from '../sessions/sessions.service';
import { accountCredentialState } from './account-credential-state';
import { authError } from './auth.errors';
import { securityNoticeJob } from './jobs/send-security-notice.job';
import { passwordState } from './password-credentials';
import { SecurityNoticesService } from './security-notices.service';
import { signInSubject, type SignInRequest, type SignInUser } from './sign-in';
import { SignInFailures } from './sign-in-failures';
import { TotpChallenges, type TotpChallenge } from './totp-challenges';
import { TotpRecoveryFinishService } from './totp-recovery-finish.service';
import { TotpService } from './totp.service';
import { UsersRepository } from './users.repository';

export type { SignInRequest, SignInUser } from './sign-in';

type Account = NonNullable<Awaited<ReturnType<UsersRepository['lockForSignIn']>>>;
type SecondFactor = {
  challengeId: string;
  grant: TotpChallenge & { attemptId: string };
  code: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SignInFailures) private readonly failures: SignInFailures,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(TotpChallenges) private readonly challenges: TotpChallenges,
    @Inject(TotpRecoveryFinishService) private readonly recovery: TotpRecoveryFinishService,
    @Inject(SecurityNoticesService) private readonly notices: SecurityNoticesService,
    @InjectQueue(QUEUES.transactional) private readonly queue: Queue,
  ) {}

  async verifyTotp(challengeId: string, code: string, ip: string) {
    const grant = await this.challenges.attempt(challengeId);
    return this.completeSignIn(grant.user, { ...grant.request, ip }, { challengeId, grant, code });
  }

  async completeSignIn(user: SignInUser, request: SignInRequest, secondFactor?: SecondFactor) {
    const account = user.registration ? undefined : await this.users.lockForSignIn(user.id);
    const subject = account ? this.totp.subject(account) : signInSubject(user.target);
    await this.failures.assertAllowed(subject, request.ip);
    let noticeIds: string[] = [];
    const result = await this.transaction.run(user.id, async () => {
      const current = await this.lockCurrent(user, secondFactor);
      if (secondFactor) {
        if (!(await this.totp.verify(current, secondFactor.code))) return undefined;
      } else if (current.totpEnabledAt) {
        return { pending: accountCredentialState(current) };
      }
      if (secondFactor) await this.recovery.cancelPending(user.id, request.ip);
      await this.completeGoogleLink(user, current.googleSubject, request.ip);
      // A new account has no earlier device to compare with.
      if (!user.registration) noticeIds = await this.notifyNewDevice(current, request);
      if (user.registrationPasswordHash)
        await this.events.record(user.id, {
          event: 'password.changed',
          actor: { kind: 'user' },
          ip: request.ip,
        });
      await this.users.signedIn(user.id, this.clock.now());
      return this.sessions.create(user.id, request);
    });
    if (!result) {
      await this.challenges.release(secondFactor!.challengeId, secondFactor!.grant.attemptId);
      await this.failures.recordFailure(subject, request.ip);
      throw authError('AUTH_TOTP_INVALID');
    }
    if ('pending' in result) return this.challenges.issue(user, request, result.pending);
    await this.failures.reset(subject);
    await this.sendNotices(noticeIds);
    return result;
  }

  private async lockCurrent(user: SignInUser, secondFactor?: SecondFactor): Promise<Account> {
    await this.createRegistration(user);
    const current = await this.users.lockForSignIn(user.id);
    if (!current)
      throw authError(user.passwordState ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_CODE_INVALID');
    if (
      secondFactor &&
      (secondFactor.grant.state !== accountCredentialState(current) ||
        secondFactor.grant.expiresAt <= this.clock.now().getTime())
    )
      throw authError('AUTH_TOTP_INVALID');
    this.assertCurrentCredentials(user, current);
    return current;
  }

  private assertCurrentCredentials(user: SignInUser, current: Account) {
    this.assertIdentity(user, current);
    if (
      user.passwordState &&
      user.passwordState !== passwordState(current.id, current.passwordHash)
    )
      throw authError('AUTH_INVALID_CREDENTIALS');
    if (current.isDisabled) throw authError('AUTH_DISABLED');
  }

  // The notice is already stored, so a queue outage leaves it for the scheduled sweep.
  private async sendNotices(noticeIds: string[]) {
    if (!noticeIds.length) return;
    try {
      await this.queue.addBulk(noticeIds.map(securityNoticeJob));
    } catch {
      this.logger.error({ event: 'security' }, 'Account security notice queueing failed');
    }
  }

  private async notifyNewDevice(current: Account, request: SignInRequest) {
    if (await this.sessions.knownDevice(current.id, request.ip, request.userAgent)) return [];
    const contact = this.totp.subject(current);
    const to = contact.email ?? contact.phone;
    if (!to) return [];
    return this.notices.enqueue(current.id, [
      {
        channel: contact.email ? 'email' : 'sms',
        to,
        text: 'A new device signed in to your Dakly account. Review devices in Security and sign out any you do not recognize.',
      },
    ]);
  }

  private assertIdentity(
    user: SignInUser,
    current: {
      phone: string | null;
      email: string | null;
      emailVerifiedAt: Date | null;
      googleSubject: string | null;
    },
  ): void {
    if (user.google) {
      return this.assertGoogleIdentity(user.google, current);
    }
    const verifiedEmail = current.emailVerifiedAt ? current.email?.toLowerCase() : undefined;
    const identifier = user.kind === 'email' ? verifiedEmail : current.phone;
    if (identifier !== user.target || (user.deliveryEmail && verifiedEmail !== user.deliveryEmail))
      throw authError(user.passwordState ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_CODE_INVALID');
  }

  private async createRegistration(user: SignInUser) {
    if (!user.registration) return;
    if (
      !(await this.users.create(user.id, {
        input: user.registration,
        now: this.clock.now(),
        passwordHash: user.registrationPasswordHash,
        google: user.google?.identity,
      }))
    )
      throw authError('AUTH_ACCOUNT_EXISTS');
  }

  private assertGoogleIdentity(
    google: NonNullable<SignInUser['google']>,
    current: { googleSubject: string | null; email: string | null; emailVerifiedAt: Date | null },
  ) {
    const { identity, mode } = google;
    if (mode !== 'link') {
      if (current.googleSubject !== identity.subject) throw authError('AUTH_INVALID_CREDENTIALS');
      return;
    }
    if (google.expectedUnlinked && current.googleSubject !== null)
      throw authError('AUTH_GOOGLE_TICKET_INVALID');
    this.assertGoogleLink(google, current);
  }

  private assertGoogleLink(
    google: NonNullable<SignInUser['google']>,
    current: { googleSubject: string | null; email: string | null; emailVerifiedAt: Date | null },
  ) {
    if (
      google.expectedEmailVerifiedAt &&
      current.emailVerifiedAt?.toISOString() !== google.expectedEmailVerifiedAt
    )
      throw authError('AUTH_GOOGLE_TICKET_INVALID');
    if (!current.emailVerifiedAt || current.email?.toLowerCase() !== google.identity.email)
      throw authError('AUTH_INVALID_CREDENTIALS');
    if (current.googleSubject && current.googleSubject !== google.identity.subject)
      throw authError('AUTH_GOOGLE_CONFLICT');
  }

  private async completeGoogleLink(user: SignInUser, currentSubject: string | null, ip: string) {
    if (!user.google || user.google.mode === 'subject') return;
    if (user.google.mode === 'link') {
      if (currentSubject === user.google.identity.subject) return;
      if (!(await this.users.linkGoogle(user.id, user.google.identity.subject, this.clock.now())))
        throw authError('AUTH_GOOGLE_CONFLICT');
    }
    await this.events.record(user.id, { event: 'google.linked', actor: { kind: 'user' }, ip });
  }
}
