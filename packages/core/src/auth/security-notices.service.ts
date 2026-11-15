import { Inject, Injectable, Logger } from '@nestjs/common';

import { EmailService } from '../email/email.service';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { AccountTransaction } from '../platform/database/account-transaction';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { DAY_MS } from '../platform/time';
import { SmsService } from '../sms/sms.service';
import { accountCredentialState } from './account-credential-state';
import { AccountRecoveryRepository } from './account-recovery.repository';
import { SecurityNoticesRepository, type ClaimedNotice } from './security-notices.repository';
import { UsersRepository } from './users.repository';

const RECOVERY_NOTICE_PERIOD_MS = 7 * DAY_MS;
export type SecurityNotice = { channel: 'sms' | 'email'; to: string; text: string };
@Injectable()
export class SecurityNoticesService {
  private readonly logger = new Logger(SecurityNoticesService.name);
  constructor(
    @Inject(SecurityNoticesRepository) private readonly repository: SecurityNoticesRepository,
    @Inject(AccountRecoveryRepository) private readonly recoveries: AccountRecoveryRepository,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
  ) {}

  enqueue(userId: string, notices: SecurityNotice[], recoveryId?: string) {
    return this.repository.enqueue(
      userId,
      notices.map((notice) =>
        this.encryption.encrypt(
          { owner: 'user', userId, purpose: 'account-security-notice' },
          Buffer.from(JSON.stringify(notice)),
        ),
      ),
      recoveryId,
    );
  }

  async dispatch(userId?: string) {
    try {
      const notices = await this.repository.claim(userId);
      const deliveries = await Promise.allSettled(notices.map((notice) => this.deliver(notice)));
      for (const delivery of deliveries)
        if (delivery.status === 'rejected') this.reportDispatchError(delivery.reason);
    } catch (error) {
      this.reportDispatchError(error);
    }
  }

  private reportDispatchError(error: unknown) {
    this.reportJobError(error);
    this.logger.error({ event: 'security' }, 'Account security notice polling failed');
  }

  private reportJobError(error: unknown) {
    const { jobId } = jobLogBindings();
    if (jobId) this.reporter.reportJob(serializeError(error), jobId);
  }

  private async deliver(notice: ClaimedNotice) {
    try {
      const plaintext = this.encryption.decrypt(
        { owner: 'user', userId: notice.userId, purpose: 'account-security-notice' },
        notice,
      );
      let message: SecurityNotice;
      try {
        message = JSON.parse(plaintext.toString()) as SecurityNotice;
      } finally {
        plaintext.fill(0);
      }
      if (message.channel === 'email')
        await this.email.send({
          to: message.to,
          subject: 'Dakly account security',
          text: message.text,
        });
      else await this.sms.send({ to: message.to, text: message.text });
      await this.transaction.run(notice.userId, async () => {
        const current = await this.users.lockForSignIn(notice.userId);
        if (!current) return;
        if (
          (await this.repository.delivered(notice, this.clock.now())) &&
          notice.recoveryId &&
          !current.isDisabled
        )
          await this.recoveries.allowAfterNotices(
            notice.userId,
            notice.recoveryId,
            accountCredentialState(current),
            new Date(this.clock.now().getTime() + RECOVERY_NOTICE_PERIOD_MS),
          );
      });
    } catch (error) {
      this.reportJobError(error);
      this.logger.warn(
        { event: 'security', noticeId: notice.id },
        'Account security notice delivery failed',
      );
      await this.repository.failed(
        notice,
        new Date(
          this.clock.now().getTime() + Math.min(3600000, 30000 * 2 ** Math.min(notice.attempts, 7)),
        ),
      );
    }
  }
}
