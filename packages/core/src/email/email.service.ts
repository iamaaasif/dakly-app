import { Inject, Injectable } from '@nestjs/common';
import type { EmailDriver, EmailMessage } from '@dakly/providers/email/email-driver';
import { EMAIL_DRIVER } from './email-provider';

@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_DRIVER) private readonly driver: EmailDriver) {}
  send(message: EmailMessage): Promise<void> {
    return this.driver.send(message);
  }
}
