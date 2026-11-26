import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { PlansResponse } from '@dakly/contracts/billing';
import {
  sendingSettingsSchema,
  stockSettingsSchema,
  dueBookSettingsSchema,
  type CreateStoreInput,
  attributionWindowSchema,
  type AttributionSettingsResponse,
  type AttributionWindow,
  type SetupProfile,
  type StoreResponse,
  type ChangeStoreSettingsInput,
  type ChangeStoreExtensionsInput,
  type StoreSettingsResponse,
  type SendingSettings,
} from '@dakly/contracts/stores';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { UsersService } from '../auth/users.service';
import { BillingService } from '../billing/billing.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { SessionsService } from '../sessions/sessions.service';
import { TeamService } from '../team/team.service';
import { MaintenanceStoresRepository } from './maintenance-stores.repository';
import { onboardingExtensions, recommendedPlans } from './onboarding';
import { storeError } from './stores.errors';
import { type StoreSettingsRow, StoresRepository } from './stores.repository';

export type StoreSendingSettings = SendingSettings & { timeZone: string };

const rebuildSchema = z.object({
  id: z.uuid(),
  timeZone: z.string(),
  startedAt: z.iso.datetime(),
  after: z.object({ id: z.uuid(), at: z.string() }).nullable(),
  processedOrders: z.int().nonnegative(),
  checkpoint: z.uuid().nullable(),
});

@Injectable()
export class StoresService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresRepository) private readonly repository: StoresRepository,
    @Inject(MaintenanceStoresRepository) private readonly maintenance: MaintenanceStoresRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async nextOrderNumber(storeId: string): Promise<number> {
    const number = await this.repository.nextOrderNumber(storeId);
    if (number === undefined) throw storeError('STORE_NOT_FOUND');
    return number;
  }

  async settings(storeId: string): Promise<StoreSettingsResponse> {
    const store = await this.repository.settings(storeId);
    if (!store) throw storeError('STORE_NOT_FOUND');
    return toSettingsResponse(store);
  }

  findPublicBySlug(slug: string) {
    return this.maintenance.findPublicBySlug(slug);
  }

  maintenanceStoreIds(after: string | null, limit: number) {
    return this.maintenance.maintenanceStoreIds(after, limit);
  }

  maintenanceStores(after: string | null, limit: number) {
    return this.maintenance.maintenanceStores(after, limit);
  }

  async customerInactivityDays(storeId: string) {
    const days = await this.repository.customerInactivityDays(storeId);
    if (days === undefined) throw storeError('STORE_NOT_FOUND');
    return days;
  }

  // The share lock stays held only while the caller's transaction is open.
  async isActive(storeId: string): Promise<boolean> {
    return (await this.repository.lockedStatus(storeId)) === 'active';
  }

  async attributionRebuild(storeId: string) {
    const state = await this.repository.attributionState(storeId);
    if (!state) throw storeError('STORE_NOT_FOUND');
    return {
      timeZone: state.timeZone,
      windowDays: attributionWindowSchema.parse(state.windowDays),
      rebuild: rebuildSchema.nullable().parse(state.rebuild),
    };
  }

  async attributionSettings(storeId: string): Promise<AttributionSettingsResponse> {
    const { windowDays, rebuild } = await this.attributionRebuild(storeId);
    return toAttributionSettings(windowDays, rebuild);
  }

  changeAttributionWindow(
    storeId: string,
    windowDays: AttributionWindow,
    actor: { userId: string; access: StoreAccess },
  ): Promise<AttributionSettingsResponse> {
    if (!this.team.canChangeAttributionWindow(actor.access))
      throw storeError('STORE_ATTRIBUTION_SETTING_DENIED');
    return this.transaction.runLocked(storeId, async () => {
      const previous = await this.attributionRebuild(storeId);
      if (windowDays === previous.windowDays)
        return toAttributionSettings(windowDays, previous.rebuild);
      const now = this.clock.now();
      const id = newId();
      const startedAt = now.toISOString();
      const rebuild = {
        id,
        startedAt,
        timeZone: previous.timeZone,
        after: null,
        processedOrders: 0,
        checkpoint: null,
      };
      await this.repository.writeAttributionState(storeId, rebuild, { windowDays, updatedAt: now });
      await this.audit.record(storeId, {
        actor: { kind: 'user', userId: actor.userId },
        action: 'attribution.window_changed',
        entityType: 'store',
        entityId: storeId,
        before: { state: String(previous.windowDays) },
        after: { state: String(windowDays) },
      });
      await this.outbox.publish({
        type: 'attribution.window_changed',
        storeId,
        occurredAt: startedAt,
        payload: { rebuildId: id },
      });
      return toAttributionSettings(windowDays, rebuild);
    });
  }

  async saveAttributionRebuild(storeId: string, rebuild: z.infer<typeof rebuildSchema> | null) {
    await this.repository.writeAttributionState(storeId, rebuild);
    if (rebuild?.after && rebuild.checkpoint === rebuild.after.id)
      await this.outbox.publish({
        type: 'attribution.rebuild_continued',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { rebuildId: rebuild.id, afterOrderId: rebuild.after.id },
      });
  }

  async attributionWindowDays(storeId: string, lock?: 'share'): Promise<AttributionWindow> {
    const days = await this.repository.attributionWindowDays(storeId, lock);
    if (days === undefined) throw storeError('STORE_NOT_FOUND');
    return attributionWindowSchema.parse(days);
  }

  async timeZone(storeId: string): Promise<string> {
    const timeZone = await this.repository.timeZone(storeId);
    if (timeZone === undefined) throw storeError('STORE_NOT_FOUND');
    return timeZone;
  }

  async sendingSettings(storeId: string, lock?: 'share'): Promise<StoreSendingSettings> {
    const store = await this.repository.sendingSettings(storeId, lock);
    if (!store) throw storeError('STORE_NOT_FOUND');
    return { ...parseSending(store.sending), timeZone: store.timeZone };
  }

  changeSettings(
    storeId: string,
    input: ChangeStoreSettingsInput,
    { userId, access }: { userId: string; access: StoreAccess },
  ): Promise<StoreSettingsResponse> {
    return this.transaction.run(storeId, async () => {
      // Turning the approval rule off would let the member approve their own campaigns.
      if (
        input.sending &&
        input.sending.onlyOwnersAndAdminsApprove !==
          (await this.sendingSettings(storeId)).onlyOwnersAndAdminsApprove &&
        !this.team.canApproveSends(access)
      )
        throw storeError('STORE_APPROVAL_SETTING_DENIED');
      const store = await this.repository.changeSettings(storeId, input, this.clock.now());
      if (!store) throw storeError('STORE_NOT_FOUND');
      await this.recordChange(
        storeId,
        userId,
        'store.settings_changed',
        Object.keys(input).filter(
          (field) => input[field as keyof ChangeStoreSettingsInput] !== undefined,
        ),
      );
      return toSettingsResponse(store);
    });
  }

  changeExtensions(
    storeId: string,
    input: ChangeStoreExtensionsInput,
    actor: { userId: string; access: StoreAccess },
  ): Promise<StoreSettingsResponse> {
    if (!this.team.canChangeExtensions(actor.access)) throw storeError('STORE_EXTENSIONS_DENIED');
    return this.transaction.run(storeId, async () => {
      const store = await this.repository.changeExtensions(
        storeId,
        input.extensions,
        this.clock.now(),
      );
      if (!store) throw storeError('STORE_NOT_FOUND');
      await this.recordChange(storeId, actor.userId, 'store.extensions_changed', ['extensions']);
      return toSettingsResponse(store);
    });
  }

  async setupProfile(storeId: string): Promise<SetupProfile> {
    const profile = await this.repository.setupProfile(storeId);
    if (!profile) throw storeError('STORE_NOT_FOUND');
    return profile;
  }

  hideSetupGuide(
    storeId: string,
    actor: { userId: string; access: StoreAccess },
  ): Promise<SetupProfile> {
    if (!this.team.canChangeExtensions(actor.access)) throw storeError('STORE_SETUP_DENIED');
    return this.transaction.run(storeId, async () => {
      const profile = await this.repository.hideSetupGuide(storeId, this.clock.now());
      if (!profile) throw storeError('STORE_NOT_FOUND');
      await this.recordChange(storeId, actor.userId, 'store.setup_guide_hidden', ['setupGuide']);
      return profile;
    });
  }

  private recordChange(
    storeId: string,
    userId: string,
    action: string,
    changedFields: string[],
  ): Promise<void> {
    return this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action,
      entityType: 'store',
      entityId: storeId,
      after: { changedFields },
    });
  }

  async plans(): Promise<PlansResponse> {
    return { plans: await this.billing.publicPlans(), recommendations: { ...recommendedPlans } };
  }

  async create(
    userId: string,
    sessionId: string,
    input: CreateStoreInput,
  ): Promise<{ store: StoreResponse; isCreated: boolean }> {
    const result = await this.transaction.runForNewStore(async (storeId) => {
      // Account recovery must see the complete membership set before its store snapshot.
      if (!(await this.users.lockVerifiedIdentity(storeId, userId)))
        throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
      const ownedStoreId = await this.team.lockAndFindOwnedStore(storeId, userId);
      if (ownedStoreId) return { storeId: ownedStoreId, isCreated: false };
      await this.repository.insert(storeId, input, onboardingExtensions(input.howYouSell));
      await this.team.addOwner(storeId, userId);
      await this.billing.startPlan(storeId, input.planCode, input.billingCycle);
      await this.audit.record(storeId, {
        actor: { kind: 'user', userId },
        action: 'store.created',
        entityType: 'store',
        entityId: storeId,
      });
      return { storeId, isCreated: true };
    });
    // A retry may return another tenant; leave the new-store scope before reading it.
    await this.sessions.setActiveStore(userId, sessionId, result.storeId);
    const store = await this.repository.find(result.storeId);
    if (!store) throw storeError('STORE_NOT_FOUND');
    return {
      store: { id: store.id, name: store.name, slug: store.slug, extensions: store.extensions },
      isCreated: result.isCreated,
    };
  }
}

// A store that never saved the section gets the defaults from the schema.
function parseSending(sending: unknown): SendingSettings {
  return sendingSettingsSchema.parse(sending ?? {});
}

function toSettingsResponse(store: StoreSettingsRow): StoreSettingsResponse {
  return {
    ...store,
    sending: parseSending(store.sending),
    stock: stockSettingsSchema.parse(store.stock ?? {}),
    dueBook: dueBookSettingsSchema.parse(store.dueBook ?? {}),
  };
}

function toAttributionSettings(
  windowDays: AttributionWindow,
  rebuild: z.infer<typeof rebuildSchema> | null,
): AttributionSettingsResponse {
  return {
    windowDays,
    rebuilding: rebuild !== null,
    processedOrders: rebuild?.processedOrders ?? null,
  };
}
