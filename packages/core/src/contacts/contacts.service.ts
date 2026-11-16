import { Inject, Injectable } from '@nestjs/common';

import type { ContactResponse, CreateContactInput } from '@dakly/contracts/contacts';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { contactError } from './contacts.errors';
import { type Contact, ContactsRepository } from './contacts.repository';

@Injectable()
export class ContactsService {
  constructor(
    @Inject(ContactsRepository) private readonly contactsRepository: ContactsRepository,
  ) {}

  async create(
    storeId: string,
    input: CreateContactInput,
    access: Pick<StoreAccess, 'seeFullPhone'>,
  ): Promise<ContactResponse> {
    // A staff add is an intentional customer under the glossary, whatever its orders.
    const contact = await this.contactsRepository.insert(storeId, {
      ...input,
      source: 'manual',
      kind: 'customer',
    });
    if (!contact) {
      throw contactError('CONTACT_PHONE_TAKEN');
    }
    return toContactResponse(contact, access.seeFullPhone);
  }

  async getById(
    storeId: string,
    id: string,
    access: Pick<StoreAccess, 'seeFullPhone'>,
  ): Promise<ContactResponse> {
    const contact = await this.contactsRepository.findById(storeId, id);
    if (!contact) {
      throw contactError('CONTACT_NOT_FOUND');
    }
    return toContactResponse(contact, access.seeFullPhone);
  }

  async assertContactExists(storeId: string, id: string): Promise<void> {
    if (!(await this.contactsRepository.findById(storeId, id))) {
      throw contactError('CONTACT_NOT_FOUND');
    }
  }
}

function toContactResponse(contact: Contact, seeFullPhone: boolean): ContactResponse {
  return {
    ...contact,
    phone: contact.phone && !seeFullPhone ? maskPhone(contact.phone) : contact.phone,
    createdAt: contact.createdAt.toISOString(),
  };
}
