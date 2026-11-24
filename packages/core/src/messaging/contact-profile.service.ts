import { Inject, Injectable } from '@nestjs/common';

import { MetaRequestError } from '@dakly/providers/channel/channel-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { AppError } from '../platform/errors/app-error';

@Injectable()
export class ContactProfileService {
  constructor(
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
  ) {}

  // Meta only ever returns a name. A refused lookup (no permission yet) is left for the next
  // message to try again; an outage throws so the queue retries.
  async fetchName(storeId: string, contactId: string): Promise<void> {
    const unnamed = await this.identities.findUnnamedMetaIdentities(storeId, contactId);
    for (const identity of unnamed) {
      if (identity.channel === 'whatsapp') continue;
      const credential = await this.credential(storeId, identity.connectionId, identity.channel);
      if (!credential) continue;
      let profile;
      try {
        profile = await this.connections.fetchMetaProfile(credential, identity.externalId);
      } catch (error) {
        if (error instanceof MetaRequestError && error.code === 'unavailable') throw error;
        continue;
      }
      if (profile?.name)
        await this.identities.recordProfileName(storeId, {
          identityId: identity.id,
          contactId,
          name: profile.name,
        });
    }
  }

  private async credential(
    storeId: string,
    connectionId: string,
    channel: 'messenger' | 'instagram',
  ) {
    try {
      return await this.connections.prepareMetaSend(storeId, connectionId, channel);
    } catch (error) {
      if (error instanceof AppError && error.code === 'CHANNEL_NOT_CONNECTED') return undefined;
      throw error;
    }
  }
}
