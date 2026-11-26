import { describe, expect, it } from 'vitest';

import type { AiAgentSettingsService } from '../ai-agent/ai-agent-settings.service';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { PriceOffersRepository } from './price-offers.repository';
import { PriceOffersService } from './price-offers.service';

const start = new Date('2026-11-26T00:00:00.000Z');
const bounds = {
  pricePoisha: 120000,
  negotiationEnabled: true,
  negotiationOpeningPoisha: 110000,
  negotiationFloorPoisha: 95000,
};

function fixture() {
  const rows: Parameters<PriceOffersRepository['insert']>[1][] = [];
  const state = {
    now: start,
    discounts: false,
    override: null as number | null,
    product: { ...bounds },
  };
  const service = new PriceOffersService(
    {
      isCustomerTurn: async () => true,
      lockProduct: async () => state.product,
      variantPrices: async () => [{ priceOverridePoisha: state.override }],
      forTurn: async (_store: string, turn: { customerMessageId: string }) =>
        rows.find((row) => row.customerMessageId === turn.customerMessageId),
      latestLive: async (_store: string, _chat: object, _product: string, now: Date) =>
        rows.findLast((row) => row.expiresAt > now),
      insert: async (_store: string, row: (typeof rows)[number]) => void rows.push(row),
    } as PriceOffersRepository,
    { runLocked: (_store: string, run: () => Promise<unknown>) => run() } as StoreTransaction,
    {
      view: async () => ({ handoverRules: { discounts: state.discounts } }),
    } as AiAgentSettingsService,
    { now: () => state.now },
  );
  return {
    rows,
    state,
    ask: (customerMessageId: string, requestedPricePoisha?: number) =>
      service.offer(
        'store',
        { conversationId: 'chat', contactId: 'buyer', customerMessageId },
        'product',
        requestedPricePoisha,
      ),
  };
}

describe('price offers', () => {
  it('expires at 24 hours and never renews a previously recorded turn', async () => {
    const { rows, state, ask } = fixture();
    const opening = { kind: 'offered', pricePoisha: 110000, isFinal: false };
    expect(await ask('first')).toEqual(opening);
    expect(rows[0]?.expiresAt.toISOString()).toBe('2026-11-27T00:00:00.000Z');
    state.now = new Date('2026-11-26T23:59:59.999Z');
    expect(await ask('first')).toEqual(opening);
    state.now = new Date('2026-11-27T00:00:00.000Z');
    expect(await ask('first')).toEqual({ kind: 'fixed' });
    expect(await ask('new ask')).toEqual(opening);
  });

  it('refuses an offer after a variant gains a price or the selling price becomes invalid', async () => {
    const { state, ask } = fixture();
    state.override = 120000;
    expect(await ask('first')).toEqual({ kind: 'fixed' });
    state.override = null;
    state.product.pricePoisha = 110000;
    expect(await ask('second')).toEqual({ kind: 'fixed' });
  });

  it('refuses a trusted quote below the floor without returning a price or using the next step', async () => {
    const { rows, ask } = fixture();
    expect(await ask('below', 94000)).toEqual({ kind: 'final' });
    expect(rows).toEqual([]);
    expect(await ask('opening')).toEqual({ kind: 'offered', pricePoisha: 110000, isFinal: false });
  });

  it('hands over when the shop switches on discount hand-over', async () => {
    const { rows, state, ask } = fixture();
    state.discounts = true;
    expect(await ask('first')).toEqual({ kind: 'handover' });
    expect(rows).toEqual([]);
  });
});
