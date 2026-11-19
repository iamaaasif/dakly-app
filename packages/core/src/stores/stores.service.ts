import { Inject, Injectable } from '@nestjs/common';

import type { PlansResponse } from '@dakly/contracts/billing';
import {
  sendingSettingsSchema,
  stockSettingsSchema,
  type CreateStoreInput,
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
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { SessionsService } from '../sessions/sessions.service';
import { TeamService } from '../team/team.service';
import { onboardingExtensions, recommendedPlans } from './onboarding';
import { storeError } from './stores.errors';
import { type StoreSettingsRow, StoresRepository } from './stores.repository';

export type StoreSendingSettings = SendingSettings & { timeZone: string };

@Injectable()
export class StoresService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresRepository) private readonly repository: StoresRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AuditService) private readonly audit: AuditService,
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
  };
}
