import { Inject, Injectable } from '@nestjs/common';

import type { CardTap } from '@dakly/contracts/product-card';

import { AppError } from '../platform/errors/app-error';
import { ProductsService } from '../products/products.service';
import { isOutOfStock, productCardText } from './sales-agent-tools.service';

const ASK_SIZE = 'কোন সাইজ নিবেন? (Which size?)';
const ASK_DETAILS =
  'অর্ডার করতে আপনার নাম, মোবাইল নম্বর, পুরো ঠিকানা ও এলাকা (থানা/উপজেলা/জেলা) লিখুন।\nPlease send your name, mobile number, full address and area.';
const GONE = 'দুঃখিত, পণ্যটি এখন পাওয়া যাচ্ছে না। (Sorry, this product is not available now.)';

// What the shop says when a customer taps a card button. It comes from the product, with no model,
// so a price or a sold-out size can never be misquoted.
@Injectable()
export class CardTapRepliesService {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  async reply(storeId: string, tap: Exclude<CardTap, { kind: 'human' }>) {
    let product;
    try {
      product = await this.products.getForChat(storeId, tap.productId);
    } catch (error) {
      if (error instanceof AppError) return GONE;
      throw error;
    }
    const buyable = product.variants.filter((variant) => !isOutOfStock(product, variant));
    if (tap.kind === 'sizes') return `${productCardText(product)}\n\n${ASK_SIZE}`;
    if (!buyable.length) return productCardText(product);
    const chosen = tap.variantId ? buyable.find(({ id }) => id === tap.variantId) : undefined;
    if (chosen) return `${product.name} (${chosen.title})\n\n${ASK_DETAILS}`;
    // A size that is gone, or none chosen yet: show what can still be bought and ask for the size.
    const sizes = buyable.map(({ title }) => title).join(', ');
    return `${product.name}: ${sizes}\n\n${ASK_SIZE}\n${ASK_DETAILS}`;
  }
}
