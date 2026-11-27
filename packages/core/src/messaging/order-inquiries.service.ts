import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  OrderInquiry,
  OrderInquiryPage,
  OrderInquiryQuery,
} from '@dakly/contracts/order-inquiries';
import type { StoreAccess } from '@dakly/contracts/team';

import { ContactsService } from '../contacts/contacts.service';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { OrderInquiriesRepository } from './order-inquiries.repository';

type UserActor = Extract<AuditEntry['actor'], { kind: 'user' }>;

const storedSources = z.array(z.object({ tool: z.string(), refs: z.array(z.string()) }));

function customerKind(isVip: boolean, hasEarlierOrder: boolean): OrderInquiry['customerKind'] {
  if (isVip) return 'vip';
  return hasEarlierOrder ? 'repeat' : 'new';
}

@Injectable()
export class OrderInquiriesService {
  constructor(
    @Inject(OrderInquiriesRepository) private readonly repository: OrderInquiriesRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async list(
    storeId: string,
    { search, cursor, limit }: OrderInquiryQuery,
    access: StoreAccess,
    actor: UserActor,
  ): Promise<OrderInquiryPage> {
    if (!(await this.canSeeChats(storeId, access))) return { items: [], nextCursor: null };
    const contactIds = search
      ? await this.contacts.searchIds(storeId, search, access, actor)
      : undefined;
    if (contactIds && !contactIds.length) return { items: [], nextCursor: null };
    const offset = cursor ?? 0;
    const rows = await this.repository.list(storeId, { contactIds }, { offset, limit });
    const page = rows.slice(0, limit);
    const shown = await this.shownProducts(
      storeId,
      page.map(({ conversationId }) => conversationId),
    );
    const items = page.map(({ isVip, hasEarlierOrder, lastMessageAt, ...row }): OrderInquiry => ({
      ...row,
      customerKind: customerKind(isVip, hasEarlierOrder),
      lastMessageAt: lastMessageAt?.toISOString() ?? null,
      product: shown.get(row.conversationId) ?? null,
    }));
    return { items, nextCursor: rows.length > limit ? offset + limit : null };
  }

  async count(storeId: string, access: StoreAccess): Promise<number> {
    return (await this.canSeeChats(storeId, access)) ? this.repository.count(storeId) : 0;
  }

  // Inquiries are chat data: a shop without chats, or a member without chat access, sees none.
  private async canSeeChats(storeId: string, { areas }: StoreAccess) {
    const { extensions } = await this.stores.settings(storeId);
    return extensions.includes('chats') && (areas.chats === 'view' || areas.chats === 'edit');
  }

  // The first product of the AI's newest product reply, read now so the price is today's.
  private async shownProducts(storeId: string, conversationIds: string[]) {
    const latest = await this.repository.latestShownProducts(storeId, conversationIds);
    const productIdOf = new Map(
      latest.flatMap(({ conversationId, aiSources }) => {
        const [productId] =
          storedSources.safeParse(aiSources).data?.find(({ tool }) => tool === 'shown_products')
            ?.refs ?? [];
        return productId ? [[conversationId, productId] as const] : [];
      }),
    );
    const found = new Map(
      (await this.products.getManyForChat(storeId, [...new Set(productIdOf.values())])).map(
        (product) => [product.id, product],
      ),
    );
    return new Map(
      [...productIdOf].flatMap(([conversationId, productId]) => {
        const product = found.get(productId);
        if (!product) return [];
        const variant = product.variants.find(({ isDefault }) => isDefault) ?? product.variants[0];
        return [
          [
            conversationId,
            { id: product.id, name: product.name, pricePoisha: variant?.pricePoisha || null },
          ] as const,
        ];
      }),
    );
  }
}
