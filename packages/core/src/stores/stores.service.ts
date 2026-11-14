import { Inject, Injectable } from '@nestjs/common';
import type { CreateStoreInput, StoreResponse } from '@dakly/contracts/stores';
import type { PlansResponse } from '@dakly/contracts/billing';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TeamService } from '../team/team.service';
import { BillingService } from '../billing/billing.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService } from '../audit/audit.service';
import { StoresRepository } from './stores.repository';
import { onboardingExtensions, recommendedPlans } from './onboarding';
import { storeError } from './stores.errors';
@Injectable()
export class StoresService {
  constructor(
    @Inject(StoresRepository) private readonly repository: StoresRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  async plans(): Promise<PlansResponse> {
    return { plans: await this.billing.publicPlans(), recommendations: { ...recommendedPlans } };
  }
  async create(
    userId: string,
    sessionId: string,
    input: CreateStoreInput,
  ): Promise<{ store: StoreResponse; isCreated: boolean }> {
    const result = await this.transaction.runForNewStore(async (storeId) => {
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
