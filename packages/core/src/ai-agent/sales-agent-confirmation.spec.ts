import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AiRunsService } from '../ai/ai-runs.service';
import type { AiService } from '../ai/ai.service';
import type { ContactMemoryService } from '../contact-memory/contact-memory.service';
import type { InboxService } from '../messaging/inbox.service';
import type { ProductsService } from '../products/products.service';
import type { StoresService } from '../stores/stores.service';
import type { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';
import { defaultShopRules } from './shop-rules';

type Step = { kind: 'tools'; calls: [string, object][] } | { kind: 'reply' };

function agent(steps: Step[], customerTexts: string[]) {
  const run = vi.fn<(name: string) => Promise<object>>(async (name) =>
    name === 'draft_order' ? { orderNumber: 7 } : { stage: 'to_pack' },
  );
  const queue = [...steps];
  const ai = {
    run: async () => {
      const step = queue.shift()!;
      return step.kind === 'reply'
        ? { kind: 'output', aiRunId: 'run', output: { reply: 'ok' } }
        : {
            kind: 'tools',
            toolCalls: step.calls.map(([name, args]) => ({
              name,
              argumentsJson: JSON.stringify(args),
            })),
          };
    },
  } as unknown as AiService;
  const service = new SalesAgentService(
    ai,
    {
      run: async (_scope: unknown, name: string) => ({ result: await run(name) }),
      deliveryZones: async () => [],
    } as unknown as SalesAgentToolsService,
    { messages: async () => ({ items: [] }) } as unknown as InboxService,
    {
      settings: async () => ({ name: 'Shop', phone: null, district: null }),
    } as unknown as StoresService,
    { chatPhotoFile: async () => undefined } as unknown as ProductsService,
    { contextFor: async () => undefined } as unknown as ContactMemoryService,
    { setOutcome: async () => undefined } as unknown as AiRunsService,
  );
  return {
    run,
    compose: () =>
      service.compose({ storeId: 's', contactId: 'c', customerTexts, rules: defaultShopRules }),
  };
}

const confirm: Step = { kind: 'tools', calls: [['confirm_order', { orderNumber: 7 }]] };

beforeAll(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
  vi.stubEnv('REDIS_URL', 'redis://localhost');
});

describe('SalesAgentService order confirmation', () => {
  it('confirms an order after the customer said yes', async () => {
    const { run, compose } = agent([confirm, { kind: 'reply' }], ['হ্যাঁ']);
    await compose();
    expect(run).toHaveBeenCalledWith('confirm_order');
  });

  it('does not confirm when the customer never said yes', async () => {
    const { run, compose } = agent([confirm, { kind: 'reply' }], ['amar order 7 er khobor ki']);
    const reply = await compose();
    expect(run).not.toHaveBeenCalledWith('confirm_order');
    expect(reply).toMatchObject({
      toolResults: expect.arrayContaining([{ error: 'CONFIRMATION_NOT_GIVEN' }]),
    });
  });

  it('does not confirm an order drafted in the same turn, even after a yes', async () => {
    const draft: Step = { kind: 'tools', calls: [['draft_order', {}]] };
    const { run, compose } = agent([draft, confirm, { kind: 'reply' }], ['yes']);
    await compose();
    expect(run).not.toHaveBeenCalledWith('confirm_order');
  });
});
