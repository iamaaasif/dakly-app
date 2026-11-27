import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ContactCountsResponse,
  ContactListQuery,
  ContactListResponse,
} from '@dakly/contracts/contacts';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { ContactListRepository } from './contact-list.repository';
import { ContactPhoneAccessService } from './contact-phone-access.service';
import { searchFilter } from './contact-search';

type Access = Pick<StoreAccess, 'seeFullPhone'>;

@Injectable()
export class ContactListService {
  constructor(
    @Inject(ContactListRepository) private readonly repository: ContactListRepository,
    @Inject(ContactPhoneAccessService) private readonly phoneAccess: ContactPhoneAccessService,
  ) {}

  async list(
    storeId: string,
    query: ContactListQuery,
    { seeFullPhone }: Access,
    actor: Extract<AuditEntry['actor'], { kind: 'user' }>,
  ): Promise<ContactListResponse> {
    const { search, ...filter } = query;
    const match = searchFilter(search, seeFullPhone);
    if (match.phone) await this.phoneAccess.checkLimit(storeId, 'lookup', seeFullPhone, actor);
    const matching = { ...filter, ...match, matchEmailAndArea: true };
    const [rows, total] = await Promise.all([
      this.repository.list(storeId, matching),
      this.repository.countListed(storeId, matching),
    ]);
    const items = rows.slice(0, query.limit).map((contact) => ({
      ...contact,
      phone: maskedUnless(seeFullPhone, contact.phone),
      whatsappPhone: maskedUnless(seeFullPhone, contact.whatsappPhone),
      createdAt: contact.createdAt.toISOString(),
      lastOrderAt: contact.lastOrderAt?.toISOString() ?? null,
    }));
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null, total };
  }

  counts(storeId: string, hasOrdered = false): Promise<ContactCountsResponse> {
    return this.repository.counts(storeId, hasOrdered);
  }
}

function maskedUnless(seeFullPhone: boolean, phone: string | null) {
  return phone && !seeFullPhone ? maskPhone(phone) : phone;
}
