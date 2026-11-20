import { Inject, Injectable } from '@nestjs/common';

import {
  ContactIdentitiesRepository,
  type InboundIdentity,
  type OutboundIdentity,
} from './contact-identities.repository';

@Injectable()
export class ContactIdentitiesService {
  constructor(
    @Inject(ContactIdentitiesRepository) private readonly identities: ContactIdentitiesRepository,
  ) {}

  async findActiveChannelIdentity(storeId: string, input: InboundIdentity) {
    const identity = await this.identities.findInboundIdentity(storeId, input);
    return identity?.deletedAt === null ? identity : undefined;
  }

  async findOutboundIdentity(storeId: string, input: OutboundIdentity) {
    const identity = await this.identities.findOutboundIdentity(storeId, input);
    return identity?.externalId.startsWith('deleted:') ? undefined : identity;
  }

  findOnConnection(storeId: string, connectionId: string, contactIds: string[]) {
    return this.identities.findOnConnection(storeId, connectionId, contactIds);
  }
}
