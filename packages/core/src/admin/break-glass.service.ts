import { Inject, Injectable } from '@nestjs/common';

import {
  breakGlassEffectSchema,
  type BreakGlassRequest,
  type BreakGlassConfirmation,
} from '@dakly/contracts/break-glass';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { RiskyActionConfirmation } from './risky-action-confirmation';
import { StaffAlertsService } from './staff-alerts.service';
import { SupportAuditService } from './support-audit.service';
import { supportError } from './support.errors';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';

type Staff = StaffIdentity & { sessionId: string };
@Injectable()
export class BreakGlassService {
  constructor(
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(SupportService) private readonly support: SupportService,
    @Inject(SupportAuditService) private readonly audit: SupportAuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(RiskyActionConfirmation) private readonly confirmation: RiskyActionConfirmation,
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
  ) {}

  async previewBreakGlass(staff: Staff, input: BreakGlassRequest) {
    const target = (await this.repository.targets(input.targetId))[0];
    if (!target) throw supportError('SUPPORT_NOT_FOUND');
    return this.transaction.runLocked(target.id, async () => {
      await this.support.authorizeBreakGlass(target.id, staff);
      const now = this.clock.now().getTime();
      const effect = breakGlassEffectSchema.parse({
        ...input,
        action: 'support.break_glass_opened',
        id: newId(),
        staffUserId: staff.id,
        staffSessionId: staff.sessionId,
        shopName: await this.repository.storeName(target.id),
        access: 'read',
        scopes: ['customers'],
        durationMinutes: 30,
        expiresAt: new Date(now + 1800000).toISOString(),
        confirmBy: new Date(now + 300000).toISOString(),
      });
      return { effect, proof: this.confirmation.sign(effect) };
    });
  }

  async openBreakGlass(staff: Staff, input: BreakGlassConfirmation, ip: string) {
    this.confirmation.verify(input.effect, input.proof);
    const effect = input.effect;
    if (
      !input.confirmed ||
      effect.staffUserId !== staff.id ||
      effect.staffSessionId !== staff.sessionId
    )
      throw supportError('CONFIRMATION_INVALID');
    return this.transaction.runLocked(effect.targetId, async () => {
      await this.support.authorizeBreakGlass(effect.targetId, staff);
      if (
        new Date(effect.confirmBy) <= this.clock.now() ||
        (await this.repository.storeName(effect.targetId)) !== effect.shopName
      )
        throw supportError('CONFIRMATION_INVALID');
      // The signed action ID is the replay record, including ended and expired grants.
      const existing = await this.repository.find(effect.targetId, effect.id);
      if (existing) return { id: existing.id };
      const auditId = await this.audit.record(
        effect.targetId,
        effect.id,
        { kind: 'staff', staffUserId: staff.id },
        effect.action,
        effect.reason,
        ip,
        { ...effect, isBreakGlass: true },
        'support_grant',
        {
          support: {
            isBreakGlass: true,
            access: effect.access,
            scopes: effect.scopes,
            reason: effect.reason,
            category: effect.category,
            expiresAt: effect.expiresAt,
          },
        },
      );
      await this.repository.insertBreakGlass(effect.targetId, effect, this.clock.now());
      await this.alerts.recordIntent(effect.targetId, auditId);
      return { id: effect.id };
    });
  }
}
