import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { SecurityNoticesService } from '@dakly/core/auth/security-notices.service';
import { runWithJobContext } from '@dakly/core/platform/logging/job-context';
import { JOB_POLL_INTERVAL_MS } from '@dakly/core/platform/time';

@Injectable()
export class AccountSecurityNoticesJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  constructor(@Inject(SecurityNoticesService) private readonly notices: SecurityNoticesService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => this.poll(), JOB_POLL_INTERVAL_MS);
    this.poll();
  }

  private poll() {
    if (this.active) return;
    this.active = runWithJobContext(() => this.notices.dispatch()).finally(() => {
      this.active = undefined;
    });
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.active;
  }
}
