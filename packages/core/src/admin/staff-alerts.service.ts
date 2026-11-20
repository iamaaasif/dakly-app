import { Inject, Injectable, Logger } from '@nestjs/common';

import { breakGlassEffectSchema, type StaffAlertPage } from '@dakly/contracts/break-glass';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import type {
  StaffAlertDriver,
  StaffAlertCredentials,
  StaffAlertMessage,
} from '@dakly/providers/staff-alert/staff-alert-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { StaffAlertsRepository } from './staff-alerts.repository';
import { STAFF_IDLE_MS } from './staff-session-policy';
import { supportError } from './support.errors';

export const STAFF_ALERT_DRIVER = Symbol('STAFF_ALERT_DRIVER');
export const STAFF_ALERT_CREDENTIALS = Symbol('STAFF_ALERT_CREDENTIALS');
type Staff = StaffIdentity & { sessionId: string };
@Injectable()
export class StaffAlertsService {
  constructor(
    @Inject(StaffAlertsRepository) private readonly repository: StaffAlertsRepository,
    @Inject(StaffTransaction) private readonly transaction: StaffTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(STAFF_ALERT_DRIVER) private readonly driver: StaffAlertDriver,
    @Inject(STAFF_ALERT_CREDENTIALS) private readonly credentials: StaffAlertCredentials | null,
  ) {}

  recordIntent(storeId: string, auditId: string) {
    return this.repository.recordIntent(storeId, auditId, this.clock.now());
  }

  async list(staff: Staff, before?: string): Promise<StaffAlertPage> {
    return this.transaction.run(staff.id, async () => {
      await this.assertStaff(staff);
      const rows = await this.repository.list(staff.id, before);
      return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
    });
  }

  async retry(staff: Staff, id: string, reason: string, ip: string) {
    await this.transaction.run(staff.id, async () => {
      await this.assertStaff(staff);
      const delivery = await this.repository.lockDelivery(staff.id, id);
      const now = this.clock.now();
      if (!delivery || delivery.status !== 'failed' || delivery.nextAttemptAt > now)
        throw supportError('SUPPORT_INVALID');
      await this.repository.retry(staff.id, { auditId: id, reason, ip, now });
    });
  }

  private async assertStaff(staff: Staff) {
    const current = await this.repository.currentStaff(staff.id, staff.sessionId);
    const now = this.clock.now();
    if (
      current.staff?.role !== 'super_admin' ||
      current.staff.status !== 'active' ||
      !current.staff.enrolledAt ||
      !current.session ||
      current.session.revokedAt ||
      current.session.expiresAt <= now ||
      !current.session.lastSeenAt ||
      current.session.lastSeenAt.getTime() + STAFF_IDLE_MS <= now.getTime()
    )
      throw supportError('SUPPORT_DENIED');
  }

  pending() {
    return this.repository.pending(this.clock.now());
  }

  async deliver(id: string) {
    const leaseId = newId();
    const task = await this.repository.claim(id, leaseId, this.clock.now());
    if (!task) return;
    try {
      if (!this.credentials) throw supportError('STAFF_ALERT_NOT_CONFIGURED');
      const event = await this.repository.event(id);
      if (!event) throw supportError('SUPPORT_NOT_FOUND');
      const effect = breakGlassEffectSchema.loose().parse(event.actionDetails);
      // The alert points to restricted audit details; free-text reasons never leave Dakly.
      await this.send(
        {
          id,
          text: `Dakly break-glass access. Staff ${event.staffUserId}; shop ${event.storeId}; ${effect.category}; customers read only until ${effect.expiresAt}. Audit ${id}. Review in the admin home.`,
        },
        this.credentials,
      );
      const now = this.clock.now();
      await this.repository.finish({
        id,
        leaseId,
        status: 'delivered',
        error: null,
        nextAttemptAt: now,
        now,
      });
    } catch {
      const now = this.clock.now();
      const error = this.credentials
        ? 'Slack delivery failed. Check the configured channel and retry.'
        : 'Slack is not configured. Set its bot token and channel, restart the worker, then retry.';
      await this.repository.finish({
        id,
        leaseId,
        status: task.attempts >= 5 ? 'failed' : 'pending',
        error,
        nextAttemptAt: new Date(now.getTime() + 30000 * 2 ** task.attempts),
        now,
      });
      throw supportError('STAFF_ALERT_DELIVERY_FAILED');
    }
  }

  // A plain notice with no audit row. Without Slack settings it is skipped, not an error.
  async notify(id: string, text: string): Promise<boolean> {
    if (!this.credentials) return false;
    await this.send({ id, text }, this.credentials);
    return true;
  }

  private send(message: StaffAlertMessage, credentials: StaffAlertCredentials) {
    return measureVendorCall(
      new Logger(StaffAlertsService.name),
      'staff_alert_delivery',
      'Staff alert delivery measured',
      () => this.driver.send(message, credentials),
    );
  }
}
