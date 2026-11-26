import { Inject, Injectable } from '@nestjs/common';

import { productNegotiationIssue } from '@dakly/contracts/products';

import { AiAgentSettingsService } from '../ai-agent/ai-agent-settings.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { PriceOffersRepository, type OfferParty, type OfferTurn } from './price-offers.repository';

type OfferResult =
  | { kind: 'offered'; pricePoisha: number; isFinal: boolean }
  | { kind: 'fixed' | 'final' | 'handover' };

type OfferPrices = {
  pricePoisha: number;
  negotiationOpeningPoisha: number;
  negotiationFloorPoisha: number;
};

export type { OfferParty, OfferTurn };

@Injectable()
export class PriceOffersService {
  constructor(
    @Inject(PriceOffersRepository) private readonly repository: PriceOffersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AiAgentSettingsService) private readonly settings: AiAgentSettingsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  offer(
    storeId: string,
    turn: OfferTurn,
    productId: string,
    requestedPricePoisha?: number,
  ): Promise<OfferResult> {
    return this.transaction.runLocked(storeId, async () => {
      if (!(await this.repository.isCustomerTurn(storeId, turn))) return { kind: 'fixed' };
      if ((await this.settings.view(storeId)).handoverRules.discounts) return { kind: 'handover' };

      const product = await this.eligibleProduct(storeId, productId);
      if (!product) return { kind: 'fixed' };
      if (
        requestedPricePoisha !== undefined &&
        requestedPricePoisha < product.negotiationFloorPoisha
      )
        return { kind: 'final' };
      return this.offerForTurn(storeId, turn, { productId, product });
    });
  }

  private async eligibleProduct(storeId: string, productId: string) {
    const product = await this.repository.lockProduct(storeId, productId);
    if (!product?.negotiationEnabled) return undefined;
    const { negotiationFloorPoisha, negotiationOpeningPoisha } = product;
    if (
      negotiationFloorPoisha === null ||
      negotiationOpeningPoisha === null ||
      negotiationFloorPoisha < 0
    )
      return undefined;
    const variants = await this.repository.variantPrices(storeId, productId);
    if (productNegotiationIssue({ ...product, variants })) return undefined;
    return { ...product, negotiationFloorPoisha, negotiationOpeningPoisha };
  }

  private async offerForTurn(
    storeId: string,
    turn: OfferTurn,
    { productId, product }: { productId: string; product: OfferPrices },
  ): Promise<OfferResult> {
    const now = this.clock.now();
    const previous = await this.repository.forTurn(storeId, turn, productId);
    if (previous)
      return previous.contactId === turn.contactId &&
        previous.expiresAt > now &&
        priceIsEligible(previous.offeredPricePoisha, product)
        ? quote(previous.offeredPricePoisha, previous.step)
        : { kind: 'fixed' };
    const latest = await this.repository.latestLive(storeId, turn, productId, now);
    if (latest?.step === 'final') return { kind: 'final' };
    const step = latest ? 'final' : 'opening';
    const price =
      step === 'opening' ? product.negotiationOpeningPoisha : product.negotiationFloorPoisha;
    await this.repository.insert(storeId, {
      ...turn,
      productId,
      offeredPricePoisha: price,
      step,
      expiresAt: new Date(now.getTime() + DAY_MS),
    });
    return quote(price, step);
  }

  async forOrder(storeId: string, party: OfferParty, variantIds: string[]) {
    if (!variantIds.length || (await this.settings.view(storeId)).handoverRules.discounts)
      return [];
    return this.repository.forOrder(storeId, party, variantIds, this.clock.now());
  }
}

function priceIsEligible(offered: number, { pricePoisha, negotiationFloorPoisha }: OfferPrices) {
  return offered >= negotiationFloorPoisha && offered < pricePoisha;
}

function quote(price: number, step: 'opening' | 'final'): OfferResult {
  return { kind: 'offered', pricePoisha: price, isFinal: step === 'final' };
}
