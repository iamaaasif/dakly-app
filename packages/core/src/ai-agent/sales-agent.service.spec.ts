import { beforeAll, expect, it, vi } from 'vitest';

import type { AiRunsService } from '../ai/ai-runs.service';
import type { AiService } from '../ai/ai.service';
import type { ContactMemoryService } from '../contact-memory/contact-memory.service';
import type { InboxService } from '../messaging/inbox.service';
import type { ProductsService } from '../products/products.service';
import type { StoresService } from '../stores/stores.service';
import type { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

const storeId = 'store-1';

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
  vi.stubEnv('REDIS_URL', 'redis://localhost');
});

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
  const inbox = { messages: vi.fn() } as unknown as InboxService;
  const stores = {
    settings: vi.fn().mockResolvedValue({ name: 'Shop', phone: '0171', district: 'Dhaka' }),
  } as unknown as StoresService;
  const products = { chatPhotoFile: vi.fn() } as unknown as ProductsService;
  const memory = {
    contextFor: vi.fn().mockResolvedValue(memoryText),
  } as unknown as ContactMemoryService;
  const runs = { setOutcome: vi.fn() } as unknown as AiRunsService;
  return {
    service: new SalesAgentService(ai, tools, inbox, stores, products, memory, runs),
    run,
    runs,
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
  vi.mocked(inbox.messages).mockResolvedValue({
    items: [{ kind: 'text', direction: 'in', body: 'saved question' }],
  } as never);

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

const reply = (text: string, aiRunId: string) => ({
  kind: 'output',
  aiRunId,
  output: { reply: text },
});

it.each([
  ['bangla', '১০% ছাড় দিচ্ছি, অর্ডার করুন', 'দুঃখিত, ছাড় নেই। অর্ডার করতে চাইলে সাইজ বলুন।'],
  ['banglish', 'Ok apu, 10% discount dilam', 'Sorry apu, discount dite parbo na. Size bolben?'],
  ['mixed', 'ঠিক আছে, free delivery দিবো', 'Delivery charge আছে, ছাড় নেই। Order korben?'],
])(
  'writes a %s reply that failed the fact check once more and sends the second',
  async (_language, first, second) => {
    const { service, run, runs } = build();
    run.mockResolvedValueOnce(reply(first, 'run-1')).mockResolvedValueOnce(reply(second, 'run-2'));

    const composed = await service.compose({ storeId, contactId: 'c-1', customerTexts: ['ছাড়?'] });

    expect(composed).toMatchObject({ kind: 'reply', text: second, aiRunId: 'run-2' });
    expect(runs.setOutcome).toHaveBeenCalledWith(storeId, 'run-1', 'failed_check', 'offer');
    const retryInput: string = run.mock.calls[1]![1].input;
    expect(retryInput).toContain('<fact_check_failed kind="offer">');
  },
);

it('hands over when the second reply fails the fact check too, and records both', async () => {
  const { service, run, runs } = build();
  run
    .mockResolvedValueOnce(reply('Panjabi ৳900', 'run-1'))
    .mockResolvedValueOnce(reply('Panjabi ৳850', 'run-2'));

  const composed = await service.compose({ storeId, contactId: 'c-1', customerTexts: ['dam?'] });

  expect(composed).toEqual({ kind: 'handover', reason: 'out_of_scope' });
  expect(runs.setOutcome).toHaveBeenCalledWith(storeId, 'run-1', 'failed_check', 'amount');
  expect(runs.setOutcome).toHaveBeenCalledWith(storeId, 'run-2', 'failed_check', 'amount');
  expect(run).toHaveBeenCalledTimes(2);
});
