import { Inject, Injectable } from '@nestjs/common';

import {
  ContactIdentitiesRepository,
  type OutboundIdentity,
} from './contact-identities.repository';

@Injectable()
export class ContactIdentitiesService {
  constructor(
    @Inject(ContactIdentitiesRepository) private readonly identities: ContactIdentitiesRepository,
  ) {}

  async findOutboundIdentity(storeId: string, input: OutboundIdentity) {
    const identity = await this.identities.findOutboundIdentity(storeId, input);
    return identity?.externalId.startsWith('deleted:') ? undefined : identity;
  }
}
