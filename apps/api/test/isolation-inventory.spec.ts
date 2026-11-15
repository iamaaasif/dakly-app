import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { IsolationInventory } from './isolation-inventory';
describe('isolation route inventory', () => {
  it('rejects a genuinely new route until it has a fixture', async () => {
    const server = new FastifyAdapter().getInstance(),
      inventory = new IsolationInventory();
    server.addHook('onRoute', (route) => inventory.record(route));
    server.get('/customers/:id', async () => ({}));
    inventory.assertCovered(['GET /customers/:id']);
    server.post('/new-shop-write', async () => ({}));
    expect(() => inventory.assertCovered(['GET /customers/:id'])).toThrow('POST /new-shop-write');
    inventory.assertCovered(['GET /customers/:id', 'POST /new-shop-write']);
    await server.close();
  });
  it('does not hide a separate HEAD handler behind a covered GET path', async () => {
    const server = new FastifyAdapter().getInstance(),
      inventory = new IsolationInventory();
    server.addHook('onRoute', (route) => inventory.record(route));
    server.head('/customers/:id', async () => 'separate implementation');
    server.get('/customers/:id', async () => ({}));
    expect(() => inventory.assertCovered(['GET /customers/:id'])).toThrow('HEAD /customers/:id');
    inventory.assertCovered(['GET /customers/:id', 'HEAD /customers/:id']);
    await server.close();
  });
});
