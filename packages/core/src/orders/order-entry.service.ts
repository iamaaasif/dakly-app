import { Inject, Injectable } from '@nestjs/common';

import type { OrderCustomerLookup, OrderCustomerLookupQuery } from '@dakly/contracts/order-entry';
import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { ContactsService } from '../contacts/contacts.service';
import { DeliveryService } from '../delivery/delivery.service';
import { AppError } from '../platform/errors/app-error';
import { ProductsService } from '../products/products.service';
import { OrderEntryRepository } from './order-entry.repository';

const recentProductLimit = 5;

@Injectable()
export class OrderEntryService {
  constructor(
    @Inject(OrderEntryRepository) private readonly repository: OrderEntryRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
  ) {}

  async lookupCustomer(
    storeId: string,
    query: OrderCustomerLookupQuery,
    access: StoreAccess,
  ): Promise<OrderCustomerLookup> {
    if ('contactId' in query) return this.describe(storeId, query.contactId, null, access);
    // Finding a customer by a typed number would show a name to a member who may not see numbers.
    if (!access.seeFullPhone) return { customer: null, openOrders: 0 };
    const contactId = await this.contacts.findIdByPhone(storeId, query.phone);
    if (contactId) return this.describe(storeId, contactId, query.phone, access);
    return {
      customer: null,
      openOrders: await this.repository.countOpenOrders(storeId, query.phone),
    };
  }

  private async describe(
    storeId: string,
    contactId: string,
    typedPhone: string | null,
    access: StoreAccess,
  ): Promise<OrderCustomerLookup> {
    const contact = await this.contacts.getById(storeId, contactId, access);
    const phone = typedPhone ?? (access.seeFullPhone ? contact.phone : null);
    const last = await this.repository.findLastOwnAddress(storeId, contactId);
    return {
      customer: {
        contactId,
        name: contact.name,
        phone,
        address: last?.address ?? null,
        area: last?.areaId
          ? ((await this.delivery.describeArea(storeId, last.areaId)) ?? null)
          : null,
      },
      openOrders: phone ? await this.repository.countOpenOrders(storeId, phone) : 0,
    };
  }

  // The products that sold last, newest first. One that cannot be ordered any more is skipped.
  async recentProducts(storeId: string): Promise<OrderCatalogueProduct[]> {
    const ids = await this.repository.findRecentProductIds(storeId, recentProductLimit * 2);
    const found = await Promise.all(
      ids.map((id) =>
        this.products.getForOrder(storeId, id).catch((error: unknown) => {
          if (error instanceof AppError && error.code === 'PRODUCT_NOT_FOUND') return undefined;
          throw error;
        }),
      ),
    );
    return found.flatMap((product) => (product ? [product] : [])).slice(0, recentProductLimit);
  }
}
