import { randomInt, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDeliveryZoneSchema, type DeliveryZoneResponse } from '@dakly/contracts/delivery';
import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { DeliveryRepository } from './delivery.repository';
import { DeliveryService } from './delivery.service';

const actor = { kind: 'system' } as const;
const now = new Date('2026-11-17T08:00:00Z');
const neighbourhood = randomInt(900000000, 1000000000);

describe('DeliveryService with Postgres', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const database = new TenantDatabase(app.db);
  const service = new DeliveryService(
    new DeliveryRepository(database),
    new StoreTransaction(database),
    { now: () => now },
  );
  const ownerRepository = new DeliveryRepository(f.tenant);
  let defaults: DeliveryZoneResponse[];
  beforeAll(async () => {
    await f.setup();
    await f.connection.pool.query(
      "insert into bd_areas(id,kind,parent_id,name) values($1,'upazila',301,'Fixture neighbourhood')",
      [neighbourhood],
    );
    defaults = (await service.initializeDefaults(f.a, actor)).items;
    await service.initializeDefaults(f.b, actor);
  });
  afterAll(async () => {
    await f.connection.pool.query('delete from delivery_zones where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.connection.pool.query('delete from bd_areas where id=$1', [neighbourhood]);
    await app.pool.end();
    await f.close();
  });

  it('sets up the three default zones without overwriting configured charges', async () => {
    expect(
      defaults.map(({ name, chargePoisha, isDefault }) => ({ name, chargePoisha, isDefault })),
    ).toEqual([
      { name: 'Inside Dhaka', chargePoisha: 6000, isDefault: false },
      { name: 'Dhaka suburbs', chargePoisha: 10000, isDefault: false },
      { name: 'Outside Dhaka', chargePoisha: 12000, isDefault: true },
    ]);
    const positions = await f.connection.pool.query<{ name: string; position: number }>(
      'select name, position from delivery_zones where store_id=$1 order by position',
      [f.a],
    );
    expect(positions.rows).toEqual([
      { name: 'Inside Dhaka', position: 0 },
      { name: 'Dhaka suburbs', position: 1 },
      { name: 'Outside Dhaka', position: 2 },
    ]);
    await expect(service.initializeDefaults(f.a, actor)).rejects.toMatchObject({
      code: 'DELIVERY_ZONES_ALREADY_CONFIGURED',
    });
  });

  it('quotes a mapped district, its parent zone, a more specific area and the default', async () => {
    expect(await service.calculateDeliveryCharge(f.a, 301)).toMatchObject({ chargePoisha: 6000 });
    expect(await service.calculateDeliveryCharge(f.a, 303)).toMatchObject({ chargePoisha: 10000 });
    expect(await service.calculateDeliveryCharge(f.a, neighbourhood)).toMatchObject({
      chargePoisha: 6000,
    });
    const specific = await service.createZone(
      f.a,
      createDeliveryZoneSchema.parse({
        name: 'Neighbourhood',
        chargePoisha: 7000,
        bdAreaIds: [neighbourhood],
      }),
      actor,
    );
    expect(await service.calculateDeliveryCharge(f.a, neighbourhood)).toEqual({
      deliveryZoneId: specific.id,
      chargePoisha: 7000,
    });
    expect(await service.calculateDeliveryCharge(f.a, 304)).toMatchObject({ chargePoisha: 12000 });
    await expect(service.calculateDeliveryCharge(f.a, 999999)).rejects.toMatchObject({
      code: 'DELIVERY_AREA_INVALID',
    });
  });

  it('refuses missing areas, divisions and an area assigned to another zone', async () => {
    for (const [bdAreaIds, code] of [
      [[999999], 'DELIVERY_AREA_INVALID'],
      [[3], 'DELIVERY_AREA_INVALID'],
      [[301], 'DELIVERY_AREA_TAKEN'],
    ] as const)
      await expect(
        service.createZone(
          f.a,
          createDeliveryZoneSchema.parse({
            name: 'Invalid zone',
            chargePoisha: 5000,
            bdAreaIds: [...bdAreaIds],
          }),
          actor,
        ),
      ).rejects.toMatchObject({ code });
  });

  it('keeps exactly one default and requires a replacement before clearing or deleting it', async () => {
    const next = await service.createZone(
      f.a,
      createDeliveryZoneSchema.parse({ name: 'New default', chargePoisha: 9000, isDefault: true }),
      actor,
    );
    expect(
      (await service.listZones(f.a, { limit: 100 })).items
        .filter((zone) => zone.isDefault)
        .map((zone) => zone.id),
    ).toEqual([next.id]);
    await expect(
      service.changeZone(f.a, next.id, { isDefault: false }, actor),
    ).rejects.toMatchObject({ code: 'DELIVERY_DEFAULT_REQUIRED' });
    await expect(service.removeZone(f.a, next.id, actor)).rejects.toMatchObject({
      code: 'DELIVERY_DEFAULT_REQUIRED',
    });
    await service.changeZone(f.a, defaults[2]!.id, { isDefault: true }, actor);
    await service.removeZone(f.a, next.id, actor);
  });

  it('serializes concurrent assignments of the same area', async () => {
    const input = createDeliveryZoneSchema.parse({
      name: 'Faridpur',
      chargePoisha: 11000,
      bdAreaIds: [302],
    });
    const outcomes = await Promise.allSettled([
      service.createZone(f.a, input, actor),
      service.createZone(f.a, input, actor),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { code: 'DELIVERY_AREA_TAKEN' },
    });
  });

  it('serializes concurrent default replacements and keeps exactly one default', async () => {
    const first = await service.createZone(
      f.a,
      createDeliveryZoneSchema.parse({ name: 'Default candidate A', chargePoisha: 9000 }),
      actor,
    );
    const second = await service.createZone(
      f.a,
      createDeliveryZoneSchema.parse({ name: 'Default candidate B', chargePoisha: 11000 }),
      actor,
    );
    await Promise.all([
      service.changeZone(f.a, first.id, { isDefault: true }, actor),
      service.changeZone(f.a, second.id, { isDefault: true }, actor),
    ]);
    const chosen = (await service.listZones(f.a, { limit: 100 })).items.filter(
      (zone) => zone.isDefault,
    );
    expect(chosen).toHaveLength(1);
    expect([first.id, second.id]).toContain(chosen[0]!.id);
    await service.changeZone(f.a, defaults[2]!.id, { isDefault: true }, actor);
    await service.removeZone(f.a, first.id, actor);
    await service.removeZone(f.a, second.id, actor);
  });

  it('initializes an empty store once across two concurrent requests', async () => {
    const storeId = randomUUID();
    await f.connection.pool.query(
      "insert into stores(id,name) values($1,'Concurrent setup fixture')",
      [storeId],
    );
    try {
      const results = await Promise.allSettled([
        service.initializeDefaults(storeId, actor),
        service.initializeDefaults(storeId, actor),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { code: 'DELIVERY_ZONES_ALREADY_CONFIGURED' },
      });
      const zones = await service.listZones(storeId, { limit: 100 });
      expect(zones.items).toHaveLength(3);
      expect(zones.items.filter((zone) => zone.isDefault)).toHaveLength(1);
    } finally {
      await f.connection.pool.query('delete from delivery_zones where store_id=$1', [storeId]);
      await f.connection.pool.query('delete from stores where id=$1', [storeId]);
    }
  });

  it('keeps every owner-connection mapping and default operation inside its store', async () => {
    const input = createDeliveryZoneSchema.parse({
      name: 'Gopalganj',
      chargePoisha: 8000,
      bdAreaIds: [304],
    });
    const zone = await service.createZone(f.b, input, actor);
    const aDefault = (await ownerRepository.findDefault(f.a))!;
    const bDefault = (await ownerRepository.findDefault(f.b))!;
    expect(aDefault.id).not.toBe(bDefault.id);
    expect(await ownerRepository.findConflict(f.a, [304])).toBeUndefined();
    expect(await ownerRepository.findConflict(f.b, [304])).toBe(zone.id);
    expect((await ownerRepository.findApplicableZones(f.a, [304])).map((item) => item.id)).toEqual([
      aDefault.id,
    ]);
    expect(
      (await ownerRepository.findApplicableZones(f.b, [304])).map((item) => item.id).sort(),
    ).toEqual([bDefault.id, zone.id].sort());
    try {
      await ownerRepository.clearDefault(f.b, now);
      expect(await ownerRepository.findDefault(f.b)).toBeUndefined();
      expect(await ownerRepository.findDefault(f.a)).toEqual(aDefault);
    } finally {
      await ownerRepository.update(f.a, aDefault.id, { isDefault: true }, now);
      await ownerRepository.update(f.b, bDefault.id, { isDefault: true }, now);
      await service.removeZone(f.b, zone.id, actor);
    }
  });

  it('edits and lists only this store under RLS and owner connections', async () => {
    const id = defaults[0]!.id;
    await expect(service.changeZone(f.b, id, { chargePoisha: 1 }, actor)).rejects.toMatchObject({
      code: 'DELIVERY_ZONE_NOT_FOUND',
    });
    await expect(service.removeZone(f.b, id, actor)).rejects.toMatchObject({
      code: 'DELIVERY_ZONE_NOT_FOUND',
    });
    expect(await ownerRepository.findById(f.b, id)).toBeUndefined();
    expect(await ownerRepository.update(f.b, id, { chargePoisha: 1 }, now)).toBeUndefined();
    expect(await ownerRepository.remove(f.b, id)).toBe(false);
    expect((await ownerRepository.list(f.b, { limit: 100 })).map((zone) => zone.id)).not.toContain(
      id,
    );
    const changed = await service.changeZone(
      f.a,
      id,
      { name: 'Dhaka city', chargePoisha: 6500 },
      actor,
    );
    expect(changed).toMatchObject({
      name: 'Dhaka city',
      chargePoisha: 6500,
      bdAreaIds: [301],
      updatedAt: now.toISOString(),
    });
  });

  it('keeps a referenced zone and reports a conflict when an order uses it', async () => {
    const zone = await service.createZone(
      f.a,
      createDeliveryZoneSchema.parse({ name: 'Referenced zone', chargePoisha: 6000 }),
      actor,
    );
    const orderId = randomUUID();
    await f.connection.pool.query(
      "insert into orders(id,store_id,number,source,created_by_type,recipient_name,recipient_phone,recipient_address,recipient_district,delivery_zone_id,items_subtotal_poisha,cod_amount_poisha) values($1,$2,20001,'manual','user','রিনা','01711000001','উত্তরা','Dhaka',$3,125000,131000)",
      [orderId, f.a, zone.id],
    );
    try {
      await expect(service.removeZone(f.a, zone.id, actor)).rejects.toMatchObject({
        code: 'DELIVERY_ZONE_IN_USE',
      });
      expect(await f.row('delivery_zones', zone.id)).toMatchObject({ charge_poisha: 6000 });
    } finally {
      await f.connection.pool.query('delete from orders where id=$1', [orderId]);
      await service.removeZone(f.a, zone.id, actor);
    }
  });

  it('requires a default when the store sets up zones itself', async () => {
    const storeId = randomUUID();
    await f.connection.pool.query(
      "insert into stores(id,name) values($1,'Fresh delivery fixture')",
      [storeId],
    );
    try {
      await expect(
        service.createZone(
          storeId,
          createDeliveryZoneSchema.parse({ name: 'City', chargePoisha: 6000 }),
          actor,
        ),
      ).rejects.toMatchObject({ code: 'DELIVERY_DEFAULT_REQUIRED' });
      expect((await service.listZones(storeId, { limit: 50 })).items).toEqual([]);
    } finally {
      await f.connection.pool.query('delete from stores where id=$1', [storeId]);
    }
  });

  it('paginates zones and the existing area hierarchy', async () => {
    const first = await service.listZones(f.b, { limit: 1 });
    const second = await service.listZones(f.b, { limit: 1, cursor: first.nextCursor! });
    expect(first.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    const districts = await service.listAreas(f.a, { parentId: 3, limit: 1 });
    expect(districts.items[0]).toMatchObject({
      id: 301,
      kind: 'district',
      parentId: 3,
      name: 'Dhaka',
    });
    expect(
      (await service.listAreas(f.a, { parentId: 3, cursor: districts.nextCursor!, limit: 1 }))
        .items[0]!.id,
    ).toBe(302);
  });
});
