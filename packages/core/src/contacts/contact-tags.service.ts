import { Inject, Injectable } from '@nestjs/common';

import { ContactTagsRepository } from './contact-tags.repository';

@Injectable()
export class ContactTagsService {
  constructor(@Inject(ContactTagsRepository) private readonly repository: ContactTagsRepository) {}

  // Every tag on the shop's live customers, for pickers such as the chat Label menu.
  inUse(storeId: string): Promise<string[]> {
    return this.repository.inUse(storeId);
  }
}
