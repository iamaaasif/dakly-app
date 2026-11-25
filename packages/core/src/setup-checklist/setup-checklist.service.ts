import { Inject, Injectable } from '@nestjs/common';

import type {
  ChangeSetupChecklistInput,
  SetupChecklistResponse,
  setupStepIds,
} from '@dakly/contracts/setup-checklist';
import type { SetupProfile } from '@dakly/contracts/stores';
import type { StoreAccess } from '@dakly/contracts/team';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ProductsService } from '../products/products.service';
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
    @Inject(ProductsService) private readonly products: ProductsService,
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
    const ids = setupStepIdsFor(profile.extensions);
    const steps = await Promise.all(
      ids.map(async (id) => ({ id, done: await this.isDone(storeId, id, profile) })),
    );
    return { howYouSell: profile.howYouSell, hidden: profile.guideHidden, steps, turnedOn };
  }

  // A step is done when its real condition is true, never because someone clicked it.
  private async isDone(storeId: string, id: StepId, profile: SetupProfile): Promise<boolean> {
    switch (id) {
      case 'add_store_details':
        return Boolean(profile.businessType && profile.district);
      case 'connect_channel':
        return this.channels.hasActive(storeId);
      case 'add_products':
        return this.products.hasChatProduct(storeId);
    }
  }
}
