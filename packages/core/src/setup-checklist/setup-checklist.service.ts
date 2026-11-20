import { Inject, Injectable } from '@nestjs/common';

import type {
  ChangeSetupChecklistInput,
  SetupChecklistResponse,
  setupStepIds,
} from '@dakly/contracts/setup-checklist';
import type { SetupProfile } from '@dakly/contracts/stores';
import type { StoreAccess } from '@dakly/contracts/team';

import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { CampaignSetupService } from '../campaigns/campaign-setup.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { OrderSetupService } from '../orders/order-setup.service';
import { ProductsService } from '../products/products.service';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { StoresService } from '../stores/stores.service';
import { setupChecklistError } from './setup-checklist.errors';
import { setupStepIdsFor } from './setup-steps';

type StepId = (typeof setupStepIds)[number];
type Actor = { userId: string; access: StoreAccess };

@Injectable()
export class SetupChecklistService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(KnowledgeSearchService) private readonly knowledge: KnowledgeSearchService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(OrderSetupService) private readonly orders: OrderSetupService,
    @Inject(SmsSendersService) private readonly smsSenders: SmsSendersService,
    @Inject(CampaignSetupService) private readonly campaigns: CampaignSetupService,
  ) {}

  async view(storeId: string): Promise<SetupChecklistResponse> {
    return this.build(storeId, await this.stores.setupProfile(storeId), []);
  }

  async change(
    storeId: string,
    input: ChangeSetupChecklistInput,
    actor: Actor,
  ): Promise<SetupChecklistResponse> {
    if (input.howYouSell) {
      const { profile, turnedOn } = await this.stores.changeHowYouSell(
        storeId,
        input.howYouSell,
        actor,
      );
      return this.build(storeId, profile, turnedOn);
    }
    // Only a finished guide is put away, so an owner cannot lose sight of open steps.
    const current = await this.view(storeId);
    if (current.steps.some(({ done }) => !done)) throw setupChecklistError('SETUP_STEPS_OPEN');
    return this.build(storeId, await this.stores.hideSetupGuide(storeId, actor), []);
  }

  private async build(
    storeId: string,
    profile: SetupProfile,
    turnedOn: string[],
  ): Promise<SetupChecklistResponse> {
    const ids = setupStepIdsFor(profile.howYouSell, profile.extensions);
    const steps = await Promise.all(
      ids.map(async (id) => ({ id, done: await this.isDone(storeId, id) })),
    );
    return { howYouSell: profile.howYouSell, hidden: profile.guideHidden, steps, turnedOn };
  }

  // A step is done when its real condition is true, never because someone clicked it.
  private async isDone(storeId: string, id: StepId): Promise<boolean> {
    switch (id) {
      case 'connect_facebook_page':
        return this.channels.hasActive(storeId, 'facebook_page');
      case 'teach_ai_answers':
        return this.knowledge.hasActiveItem(storeId);
      case 'add_products':
        return this.products.hasChatProduct(storeId);
      case 'chats_to_orders':
        return this.orders.hasChatOrder(storeId);
      // WhatsApp connect is blocked (CHN-3), so an approved SMS sender also counts.
      case 'set_up_messaging':
        return (
          (await this.channels.hasActive(storeId, 'whatsapp')) ||
          (await this.smsSenders.approvedSenderName(storeId)) !== undefined
        );
      case 'send_first_campaign':
        return this.campaigns.hasStarted(storeId);
    }
  }
}
