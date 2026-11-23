import { expect, it, vi } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { ContactMemoryService } from '../contact-memory/contact-memory.service';
import type { InboxService } from '../messaging/inbox.service';
import type { ProductsService } from '../products/products.service';
import type { StoresService } from '../stores/stores.service';
import type { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

const storeId = 'store-1';

function build(memoryText: string | undefined = undefined) {
  const run = vi.fn().mockResolvedValue({
    kind: 'output',
    aiRunId: 'run-1',
    output: { reply: 'ok' },
  });
  const ai = { run } as unknown as AiService;
  const tools = {
    run: vi.fn().mockResolvedValue({ products: [] }),
  } as unknown as SalesAgentToolsService;
  const inbox = { replyHistory: vi.fn().mockResolvedValue([]) } as unknown as InboxService;
  const stores = {
    settings: vi.fn().mockResolvedValue({ name: 'Shop', phone: '0171', district: 'Dhaka' }),
  } as unknown as StoresService;
  const products = { chatPhotoFile: vi.fn() } as unknown as ProductsService;
  const memory = {
    contextFor: vi.fn().mockResolvedValue(memoryText),
  } as unknown as ContactMemoryService;
  return {
    service: new SalesAgentService(ai, tools, inbox, stores, products, memory),
    run,
    tools,
    inbox,
    memory,
  };
}

it('puts a practice question, which has no saved chat, into the model conversation', async () => {
  const { service, run } = build();

  await service.compose({ storeId, contactId: 'c-1', customerTexts: ['Delivery charge koto?'] });

  const input: string = run.mock.calls[0]![1].input;
  expect(input).toContain(
    '<conversation untrusted="true">[{"from":"customer","text":"Delivery charge koto?"}]</conversation>',
  );
});

it('reads a real chat from its saved messages, not from the texts again', async () => {
  const { service, run, inbox } = build();
  vi.mocked(inbox.replyHistory).mockResolvedValue([
    { id: 'm-1', direction: 'in', body: 'saved question', mediaText: null, aiSources: null },
  ]);

  await service.compose({
    storeId,
    contactId: 'c-1',
    chat: { conversationId: 'conv-1', channel: 'messenger' },
    customerTexts: ['saved question'],
  });

  const input: string = run.mock.calls[0]![1].input;
  expect(input.match(/saved question/g)).toHaveLength(1);
});

it('puts the remembered facts between the shop and the conversation, as untrusted data', async () => {
  const { service, run, memory } = build('Remembered from earlier chats.\n- size: M');

  await service.compose({ storeId, contactId: 'c-1', customerTexts: ['Panjabi ache?'] });

  const input: string = run.mock.calls[0]![1].input;
  expect(memory.contextFor).toHaveBeenCalledWith(storeId, 'c-1');
  expect(input).toContain(
    '<customer_memory untrusted="true">Remembered from earlier chats.\n- size: M</customer_memory>',
  );
  expect(input.indexOf('<shop>')).toBeLessThan(input.indexOf('<customer_memory'));
  expect(input.indexOf('<customer_memory')).toBeLessThan(input.indexOf('<conversation'));
});

it('sends no memory block when the customer has none', async () => {
  const { service, run } = build();

  await service.compose({ storeId, contactId: 'c-1', customerTexts: ['Panjabi ache?'] });

  expect(run.mock.calls[0]![1].input).not.toContain('customer_memory');
});

const chat = { conversationId: 'conv-1', channel: 'messenger' } as const;
const kurti = {
  productId: 'p-kurti',
  name: 'কুর্তি',
  variants: [{ variantId: 'v-l', title: 'L', priceTaka: 1450, stock: 8 }],
};

it('reads the products shown earlier in the chat again, so "L ache?" quotes that one', async () => {
  const { service, run, inbox, tools } = build();
  vi.mocked(inbox.replyHistory).mockResolvedValue([
    { id: 'm-3', direction: 'in', body: 'L ache?', mediaText: null, aiSources: null },
    {
      id: 'm-2',
      direction: 'out',
      body: 'কুর্তি আছে, ৳১,৪৫০।',
      mediaText: null,
      aiSources: [{ tool: 'shown_products', refs: ['p-kurti'] }],
    },
    { id: 'm-1', direction: 'in', body: 'kurti ache?', mediaText: null, aiSources: null },
  ]);
  vi.mocked(tools.run).mockImplementation(async (_scope, name) =>
    name === 'get_product' ? kurti : { products: [] },
  );

  const composed = await service.compose({
    storeId,
    contactId: 'c-1',
    chat,
    customerTexts: ['L ache?'],
  });

  expect(tools.run).toHaveBeenCalledWith(
    expect.anything(),
    'get_product',
    JSON.stringify({ productId: 'p-kurti' }),
  );
  expect(run.mock.calls[0]![1].prompt.version).toBe('chat-reply.v5+products-in-chat.v1');
  const input: string = run.mock.calls[0]![1].input;
  expect(input).toMatch(/<products_in_this_chat>.*"stock":8.*<\/products_in_this_chat>/);
  // The fact check reads the same result, so the price the model quotes from it is allowed.
  expect(composed.kind === 'reply' && composed.toolResults).toContainEqual(
    expect.objectContaining({ products: [kurti] }),
  );
});

it('keeps a read photo in the conversation, so "red ta ache?" has the photo to point at', async () => {
  const { service, run, inbox } = build();
  vi.mocked(inbox.replyHistory).mockResolvedValue([
    { id: 'm-2', direction: 'in', body: 'red ta ache?', mediaText: null, aiSources: null },
    {
      id: 'm-1',
      direction: 'in',
      body: null,
      mediaText: 'Photo: A red kurti with a white flower print.',
      aiSources: null,
    },
  ]);

  await service.compose({ storeId, contactId: 'c-1', chat, customerTexts: ['red ta ache?'] });

  const input: string = run.mock.calls[0]![1].input;
  expect(input).toContain(
    '[{"from":"customer","text":"Photo: A red kurti with a white flower print."},{"from":"customer","text":"red ta ache?"}]',
  );
});

it('adds no shown products when the chat has none, so the model still asks which product', async () => {
  const { service, run, tools } = build();

  await service.compose({ storeId, contactId: 'c-1', chat, customerTexts: ['L ache?'] });

  expect(run.mock.calls[0]![1].input).not.toContain('products_in_this_chat');
  expect(run.mock.calls[0]![1].prompt.version).toBe('chat-reply.v5');
  expect(tools.run).not.toHaveBeenCalledWith(expect.anything(), 'get_product', expect.anything());
});

it('saves the product a reply names with its sources, for the next turn', async () => {
  const { service, run, tools } = build();
  vi.mocked(tools.run).mockResolvedValue({ products: [kurti] });
  run.mockResolvedValue({
    kind: 'output',
    aiRunId: 'run-1',
    output: { reply: 'কুর্তি আছে, ৳১,৪৫০।' },
  });

  const composed = await service.compose({
    storeId,
    contactId: 'c-1',
    chat,
    customerTexts: ['kurti ache?'],
  });

  expect(composed.kind === 'reply' && composed.sources).toContainEqual({
    tool: 'shown_products',
    refs: ['p-kurti'],
  });
});
