import { Inject, Injectable } from '@nestjs/common';
import { and, arrayOverlaps, asc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type {
  AreaListQuery,
  AreaResponse,
  ChangeDeliveryZoneInput,
  CreateDeliveryZoneInput,
  DeliveryZoneListQuery,
} from '@dakly/contracts/delivery';
import { bdAreas } from '@dakly/db/schema/areas';
import { deliveryZones } from '@dakly/db/schema/orders';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

const zoneColumns = {
  id: deliveryZones.id,
  name: deliveryZones.name,
  chargePoisha: deliveryZones.chargePoisha,
  bdAreaIds: deliveryZones.bdAreaIds,
  isDefault: deliveryZones.isDefault,
  createdAt: deliveryZones.createdAt,
  updatedAt: deliveryZones.updatedAt,
};
const areaColumns = {
  id: bdAreas.id,
  name: bdAreas.name,
  nameBn: bdAreas.nameBn,
  parentId: bdAreas.parentId,
  kind: bdAreas.kind,
};
export type DeliveryZone = CreateDeliveryZoneInput & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class DeliveryRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  list(storeId: string, query: DeliveryZoneListQuery): Promise<DeliveryZone[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(zoneColumns)
        .from(deliveryZones)
        .where(
          and(
            eq(deliveryZones.storeId, storeId),
            query.cursor ? gt(deliveryZones.id, query.cursor) : undefined,
          ),
        )
        .orderBy(asc(deliveryZones.id))
        .limit(query.limit + 1),
    );
  }

  async count(storeId: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(deliveryZones)
        .where(eq(deliveryZones.storeId, storeId)),
    );
    return row?.count ?? 0;
  }

  async findById(storeId: string, id: string): Promise<DeliveryZone | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(zoneColumns)
        .from(deliveryZones)
        .where(and(eq(deliveryZones.storeId, storeId), eq(deliveryZones.id, id))),
    );
    return rows[0];
  }

  async findDefault(storeId: string): Promise<DeliveryZone | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(zoneColumns)
        .from(deliveryZones)
        .where(and(eq(deliveryZones.storeId, storeId), eq(deliveryZones.isDefault, true)))
        .limit(1),
    );
    return rows[0];
  }

  async findConflict(
    storeId: string,
    areaIds: number[],
    exceptId?: string,
  ): Promise<string | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: deliveryZones.id })
        .from(deliveryZones)
        .where(
          and(
            eq(deliveryZones.storeId, storeId),
            arrayOverlaps(deliveryZones.bdAreaIds, areaIds),
            exceptId ? ne(deliveryZones.id, exceptId) : undefined,
          ),
        )
        .limit(1),
    );
    return rows[0]?.id;
  }

  findApplicableZones(storeId: string, areaIds: number[]): Promise<DeliveryZone[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(zoneColumns)
        .from(deliveryZones)
        .where(
          and(
            eq(deliveryZones.storeId, storeId),
            or(arrayOverlaps(deliveryZones.bdAreaIds, areaIds), eq(deliveryZones.isDefault, true)),
          ),
        ),
    );
  }

  insert(
    storeId: string,
    zones: (CreateDeliveryZoneInput & { position?: number })[],
    now: Date,
  ): Promise<DeliveryZone[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .insert(deliveryZones)
        .values(zones.map((zone) => ({ ...zone, storeId, createdAt: now, updatedAt: now })))
        .returning(zoneColumns),
    );
  }

  async update(
    storeId: string,
    id: string,
    input: ChangeDeliveryZoneInput,
    now: Date,
  ): Promise<DeliveryZone> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(deliveryZones)
        .set({ ...input, updatedAt: now })
        .where(and(eq(deliveryZones.storeId, storeId), eq(deliveryZones.id, id)))
        .returning(zoneColumns),
    );
    return rows[0]!;
  }

  async clearDefault(storeId: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(deliveryZones)
        .set({ isDefault: false, updatedAt: now })
        .where(and(eq(deliveryZones.storeId, storeId), eq(deliveryZones.isDefault, true))),
    );
  }

  async remove(storeId: string, id: string): Promise<'in_use' | void> {
    try {
      await this.database.forStore(storeId, (tx) =>
        tx
          .delete(deliveryZones)
          .where(and(eq(deliveryZones.storeId, storeId), eq(deliveryZones.id, id))),
      );
    } catch (error) {
      if (
        isConstraintViolation(error, '23503', 'orders_delivery_zone_id_delivery_zones_id_fk') ||
        isConstraintViolation(error, '23503', 'orders_delivery_zone_id_store_fk')
      )
        return 'in_use';
      throw error;
    }
  }

  listAreas(storeId: string, query: AreaListQuery): Promise<AreaResponse[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(areaColumns)
        .from(bdAreas)
        .where(
          and(
            query.parentId ? eq(bdAreas.parentId, query.parentId) : isNull(bdAreas.parentId),
            query.cursor ? gt(bdAreas.id, query.cursor) : undefined,
          ),
        )
        .orderBy(asc(bdAreas.id))
        .limit(query.limit + 1),
    );
  }

  listDistricts(storeId: string): Promise<AreaResponse[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(areaColumns)
        .from(bdAreas)
        .where(eq(bdAreas.kind, 'district'))
        .orderBy(asc(bdAreas.name)),
    );
  }

  findAreasByName(storeId: string, name: string, limit: number): Promise<AreaResponse[]> {
    const pattern = `${name.replace(/[\\%_]/g, '\\$&')}%`;
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(areaColumns)
        .from(bdAreas)
        .where(
          and(
            ne(bdAreas.kind, 'division'),
            or(sql`${bdAreas.name} ilike ${pattern}`, sql`${bdAreas.nameBn} ilike ${pattern}`),
          ),
        )
        .orderBy(sql`lower(${bdAreas.name}) = lower(${name}) desc`, asc(bdAreas.id))
        .limit(limit),
    );
  }

  findAreas(storeId: string, ids: number[]): Promise<AreaResponse[]> {
    return this.database.forStore(storeId, (tx) =>
      tx.select(areaColumns).from(bdAreas).where(inArray(bdAreas.id, ids)),
    );
  }

  async findAreaPath(
    storeId: string,
    id: number,
  ): Promise<Pick<AreaResponse, 'id' | 'kind' | 'name'>[]> {
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<Pick<AreaResponse, 'id' | 'kind' | 'name'>>(sql`
      with recursive area_path as (
        select id, parent_id, kind, name, 0 as depth from ${bdAreas} where id = ${id}
        union all
        select parent.id, parent.parent_id, parent.kind, parent.name, child.depth + 1
        from ${bdAreas} parent join area_path child on child.parent_id = parent.id
      ) select id, kind, name from area_path order by depth`),
    );
    return result.rows;
  }
}
