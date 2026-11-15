import { Inject, Injectable } from '@nestjs/common';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import {
  staffRecoveryEffectSchema,
  type StaffRecoveryRequest,
  type StaffRecoveryPreview,
  type StaffRecoveryCode,
  type StaffRecoveryConfirmation,
  type StaffRecoveryEffect,
} from '@dakly/contracts/staff-recovery';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { SecurityNoticesService, type SecurityNotice } from '../auth/security-notices.service';
import { SignInCodesService, type SignInSubject } from '../auth/sign-in-codes.service';
import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { AccountTransaction } from '../platform/database/account-transaction';
import { newId } from '../platform/database/new-id';
import { SessionsService } from '../sessions/sessions.service';
import { RiskyActionConfirmation, RISKY_ACTION_CONFIRM_MS } from './risky-action-confirmation';
import { StaffAuditService } from './staff-audit.service';
import { StaffIdentityService } from './staff-identity.service';
import { recoveryError } from './staff-recovery.errors';
import {
  StaffRecoveryRepository,
  type RecoveryStaff,
  type RecoveryStores,
} from './staff-recovery.repository';
import { isStaffSessionCurrent } from './staff-session-policy';

type Staff = StaffIdentity & { sessionId: string };
type RecoveryAccount = NonNullable<Awaited<ReturnType<UsersService['recoveryState']>>>;
@Injectable()
export class StaffRecoveryService {
  constructor(
    @Inject(StaffRecoveryRepository) private readonly repository: StaffRecoveryRepository,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(SignInCodesService) private readonly codes: SignInCodesService,
    @Inject(SecurityNoticesService) private readonly notices: SecurityNoticesService,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(StaffAuditService) private readonly audit: StaffAuditService,
    @Inject(StaffIdentityService) private readonly identities: StaffIdentityService,
    @Inject(RiskyActionConfirmation) private readonly confirmation: RiskyActionConfirmation,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async lookup(staff: Staff, identifier: string) {
    const targetId = await this.users.recoveryTarget(identifier);
    if (!targetId) throw recoveryError('RECOVERY_DENIED');
    return this.transaction.run(targetId, async () => {
      const { user } = await this.authorize(staff, { targetId });
      return { id: user.id, name: user.name };
    });
  }

  preview(staff: Staff, input: StaffRecoveryRequest): Promise<StaffRecoveryPreview> {
    return this.transaction.run(input.targetId, async () => {
      const { user, stores } = await this.authorize(staff, input);
      this.assertChecks(input, user, stores);
      const effect = staffRecoveryEffectSchema.parse({
        ...input,
        action: 'account.recovered',
        id: newId(),
        staffUserId: staff.id,
        staffSessionId: staff.sessionId,
        targetName: user.name,
        credentialState: user.credentialState,
        confirmBy: new Date(this.clock.now().getTime() + RISKY_ACTION_CONFIRM_MS).toISOString(),
      });
      return { effect, proof: this.confirmation.sign(effect) };
    });
  }

  async requestCode(staff: Staff, input: StaffRecoveryCode, ip: string) {
    this.verify(staff, input);
    const user = await this.transaction.run(input.effect.targetId, async () => {
      const { user } = await this.authorize(staff, input.effect);
      await this.assertCurrent(input.effect, user);
      return user;
    });
    await this.codes.send({
      subject: this.subject(input.effect, user, input.channel),
      purpose: input.channel === 'phone' ? 'staff_recovery_phone' : 'staff_recovery_email',
      ip,
    });
  }

  async recover(staff: Staff, input: StaffRecoveryConfirmation, ip: string) {
    this.verify(staff, input);
    const effect = input.effect;
    await this.prove(staff, input, ip);
    return this.transaction.run(effect.targetId, async () => {
      const { user, stores } = await this.check(staff, effect);
      const now = this.clock.now();
      const actor = { kind: 'staff' as const, staffId: staff.id, reasonType: effect.reasonType };
      await this.audit.recordForAccount(user.id, effect.id, {
        actor: { kind: 'staff', staffUserId: staff.id },
        action: effect.action,
        targetType: 'user',
        targetId: user.id,
        reason: effect.reason,
        ip,
        actionDetails: {
          reasonType: effect.reasonType,
          checks: effect.checks,
          removeTotp: effect.removeTotp,
          phoneChanged: Boolean(effect.newPhone),
          emailChanged: Boolean(effect.newEmail),
        },
      });
      await this.users.recover(user.id, effect, now);
      await this.sessions.revokeAll(user.id, ip, actor);
      await this.events.record(user.id, { event: 'recovery.completed', actor, ip });
      await this.repository.recordHistory(user.id, effect.id, stores.stores);
      await this.notices.enqueue(user.id, this.deliveries(user, stores, effect, now));
      return { id: effect.id };
    });
  }

  private async authorize(
    staff: Staff,
    input: Pick<StaffRecoveryRequest, 'targetId' | 'newPhone' | 'newEmail'>,
  ) {
    const user = await this.users.recoveryState(input.targetId);
    if (!user) throw recoveryError('RECOVERY_DENIED');
    const stores = await this.repository.stores(user.id);
    if (stores.overflow) throw recoveryError('RECOVERY_LIMIT');
    const current = await this.repository.staff(user.id, staff.id, staff.sessionId);
    this.assertStaff(current);
    if (
      await this.identities.recoveryConflict(user.id, staff.id, stores.stores, [
        user,
        { phone: input.newPhone, email: input.newEmail },
      ])
    )
      throw recoveryError('RECOVERY_DENIED');
    if (stores.owners.some((owner) => !owner.phone && !owner.email))
      throw recoveryError('RECOVERY_CONTACT');
    return { user, stores };
  }

  private async check(staff: Staff, effect: StaffRecoveryEffect) {
    const { user, stores } = await this.authorize(staff, effect);
    this.assertChecks(effect, user, stores);
    await this.assertCurrent(effect, user);
    return { user, stores };
  }

  private assertChecks(input: StaffRecoveryRequest, user: RecoveryAccount, stores: RecoveryStores) {
    if (stores.stores.length && !input.checks.storeDetailsMatched)
      throw recoveryError('RECOVERY_CHECKS');
    if (provesCurrentContact(input) && !user.phone && !user.email)
      throw recoveryError('RECOVERY_CONTACT');
  }

  private assertStaff(current: RecoveryStaff) {
    const now = this.clock.now();
    if (
      !current.staff ||
      !['support', 'super_admin'].includes(current.staff.role) ||
      current.staff.status !== 'active' ||
      !current.staff.enrolledAt ||
      !current.session ||
      !isStaffSessionCurrent(current.session, now)
    )
      throw recoveryError('RECOVERY_DENIED');
  }

  private verify(staff: Staff, input: StaffRecoveryPreview) {
    this.confirmation.verify(input.effect, input.proof);
    if (
      input.effect.staffUserId !== staff.id ||
      input.effect.staffSessionId !== staff.sessionId ||
      new Date(input.effect.confirmBy) <= this.clock.now()
    )
      throw recoveryError('RECOVERY_STALE');
  }

  private async assertCurrent(effect: StaffRecoveryEffect, user: RecoveryAccount) {
    if (
      new Date(effect.confirmBy) <= this.clock.now() ||
      effect.credentialState !== user.credentialState ||
      effect.targetName !== user.name ||
      (await this.repository.used(user.id, effect.id))
    )
      throw recoveryError('RECOVERY_STALE');
  }

  private subject(effect: StaffRecoveryEffect, user: RecoveryAccount, channel: 'phone' | 'email') {
    const contact = provesCurrentContact(effect)
      ? user
      : { phone: effect.newPhone, email: effect.newEmail };
    const target = channel === 'phone' ? contact.phone : contact.email;
    if (!target) throw recoveryError('RECOVERY_PROOF');
    return {
      target,
      userId: effect.targetId,
      ...(channel === 'email' ? { email: target } : { phone: target }),
      binding: JSON.stringify([
        effect.action,
        effect.id,
        effect.targetId,
        effect.staffUserId,
        effect.staffSessionId,
        effect.credentialState,
      ]),
    };
  }

  // Codes are consumed only after the same checks pass, so a refused request keeps them usable.
  private async prove(staff: Staff, input: StaffRecoveryConfirmation, ip: string) {
    const effect = input.effect;
    if (!effect.removeTotp && !effect.newPhone && !effect.newEmail) return;
    const { user } = await this.transaction.run(effect.targetId, () => this.check(staff, effect));
    const consume = (channel: 'phone' | 'email', code: string | undefined) =>
      this.consume(this.subject(effect, user, channel), channel, code, ip);
    if (provesCurrentContact(effect))
      return consume(input.phoneCode ? 'phone' : 'email', input.phoneCode ?? input.emailCode);
    if (effect.newPhone) await consume('phone', input.phoneCode);
    if (effect.newEmail) await consume('email', input.emailCode);
  }

  private async consume(
    subject: SignInSubject,
    channel: 'phone' | 'email',
    code: string | undefined,
    ip: string,
  ) {
    if (!code) throw recoveryError('RECOVERY_PROOF');
    const grant = await this.codes.consume(
      subject,
      channel === 'phone' ? 'staff_recovery_phone' : 'staff_recovery_email',
      code,
      ip,
    );
    if (grant.userId !== subject.userId) throw recoveryError('RECOVERY_PROOF');
  }

  private deliveries(
    user: RecoveryAccount,
    stores: RecoveryStores,
    effect: StaffRecoveryEffect,
    now: Date,
  ): SecurityNotice[] {
    const changes = [
      effect.removeTotp ? 'two-step verification and backup codes removed' : '',
      effect.newPhone ? 'phone replaced' : '',
      effect.newEmail ? 'email replaced' : '',
      'all sessions signed out',
    ]
      .filter(Boolean)
      .join(', ');
    const text = `Recovered by Dakly support: ${user.name}. At ${now.toISOString()}: ${changes}. Reason: ${effect.reasonType.replaceAll('_', ' ')}.`;
    const contacts = [user, ...stores.owners, { phone: effect.newPhone, email: effect.newEmail }];
    const notices = contacts.flatMap((contact): SecurityNotice[] => [
      ...(contact.phone ? [{ channel: 'sms' as const, to: contact.phone, text }] : []),
      ...(contact.email ? [{ channel: 'email' as const, to: contact.email, text }] : []),
    ]);
    return [
      ...new Map(
        notices.map((notice) => [`${notice.channel}:${notice.to.toLowerCase()}`, notice]),
      ).values(),
    ];
  }
}

// Removing 2-step without a replacement contact is proved on a current verified contact.
function provesCurrentContact(input: StaffRecoveryRequest) {
  return input.removeTotp && !input.newPhone && !input.newEmail;
}
