import { Inject, Injectable, Logger } from '@nestjs/common';

import type { EmailDriver, EmailMessage } from '@dakly/providers/email/email-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { EMAIL_DRIVER } from './email-provider';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(@Inject(EMAIL_DRIVER) private readonly driver: EmailDriver) {}

  send(message: EmailMessage): Promise<void> {
    return measureVendorCall(this.logger, 'email_delivery', 'Email delivery measured', () =>
      this.driver.send(message),
    );
  }
}
