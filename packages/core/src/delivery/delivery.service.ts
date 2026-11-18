import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  AreaListQuery,
  AreaListResponse,
  ChangeDeliveryZoneInput,
  CreateDeliveryZoneInput,
  DeliveryChargeResponse,
  DeliveryZoneListQuery,
  DeliveryZoneListResponse,
  DeliveryZoneResponse,
} from '@dakly/contracts/delivery';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { deliveryError } from './delivery.errors';
import { DeliveryRepository, type DeliveryZone } from './delivery.repository';

type Actor = AuditEntry['actor'];
const DEFAULT_ZONES = [
  { name: 'Inside Dhaka', chargePoisha: 6000, bdAreaIds: [301], isDefault: false, position: 0 },
  {
    name: 'Dhaka suburbs',
    chargePoisha: 10000,
    bdAreaIds: [303, 309, 30260072],
    isDefault: false,
    position: 1,
  },
  { name: 'Outside Dhaka', chargePoisha: 12000, bdAreaIds: [], isDefault: true, position: 2 },
];

@Injectable()
export class DeliveryService {
  constructor(
    @Inject(DeliveryRepository) private readonly repository: DeliveryRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  initializeDefaults(storeId: string, _actor: Actor): Promise<DeliveryZoneListResponse> {
    return this.transaction.runLocked(storeId, async () => {
      if ((await this.repository.list(storeId, { limit: 1 })).length)
        throw deliveryError('DELIVERY_ZONES_ALREADY_CONFIGURED');
      const zones = await this.repository.insert(storeId, DEFAULT_ZONES, this.clock.now());
      return { items: zones.map(toResponse), nextCursor: null };
    });
  }

  async listZones(
    storeId: string,
    query: DeliveryZoneListQuery,
  ): Promise<DeliveryZoneListResponse> {
    const zones = await this.repository.list(storeId, query);
    const items = zones.slice(0, query.limit).map(toResponse);
    return { items, nextCursor: zones.length > query.limit ? items.at(-1)!.id : null };
  }

  createZone(
    storeId: string,
    input: CreateDeliveryZoneInput,
    _actor: Actor,
  ): Promise<DeliveryZoneResponse> {
    return this.transaction.runLocked(storeId, async () => {
      await this.assertAreasAvailable(storeId, input.bdAreaIds);
      if (input.isDefault) await this.repository.clearDefault(storeId, this.clock.now());
      else if (!(await this.repository.findDefault(storeId)))
        throw deliveryError('DELIVERY_DEFAULT_REQUIRED');
      const zones = await this.repository.insert(storeId, [input], this.clock.now());
      return toResponse(zones[0]!);
    });
  }

  changeZone(
    storeId: string,
    id: string,
    input: ChangeDeliveryZoneInput,
    _actor: Actor,
  ): Promise<DeliveryZoneResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const zone = await this.repository.findById(storeId, id);
      if (!zone) throw deliveryError('DELIVERY_ZONE_NOT_FOUND');
      if (zone.isDefault && input.isDefault === false)
        throw deliveryError('DELIVERY_DEFAULT_REQUIRED');
      if (input.bdAreaIds) await this.assertAreasAvailable(storeId, input.bdAreaIds, id);
      if (input.isDefault) await this.repository.clearDefault(storeId, this.clock.now());
      const updated = await this.repository.update(storeId, id, input, this.clock.now());
      return toResponse(updated);
    });
  }

  removeZone(storeId: string, id: string, _actor: Actor): Promise<void> {
    return this.transaction.runLocked(storeId, async () => {
      const zone = await this.repository.findById(storeId, id);
      if (!zone) throw deliveryError('DELIVERY_ZONE_NOT_FOUND');
      if (zone.isDefault) throw deliveryError('DELIVERY_DEFAULT_REQUIRED');
      const removed = await this.repository.remove(storeId, id);
      if (removed === 'in_use') throw deliveryError('DELIVERY_ZONE_IN_USE');
    });
  }

  async listAreas(storeId: string, query: AreaListQuery): Promise<AreaListResponse> {
    const areas = await this.repository.listAreas(storeId, query);
    const items = areas.slice(0, query.limit);
    return { items, nextCursor: areas.length > query.limit ? items.at(-1)!.id : null };
  }

  async calculateDeliveryCharge(storeId: string, areaId: number): Promise<DeliveryChargeResponse> {
    const path = await this.repository.findAreaPath(storeId, areaId);
    if (!path[0] || path[0].kind === 'division') throw deliveryError('DELIVERY_AREA_INVALID');
    const zones = await this.repository.findApplicableZones(
      storeId,
      path.map((area) => area.id),
    );
    const zone =
      path
        .map((area) => zones.find((candidate) => candidate.bdAreaIds.includes(area.id)))
        .find(Boolean) ?? zones.find((candidate) => candidate.isDefault);
    if (!zone) throw deliveryError('DELIVERY_DEFAULT_REQUIRED');
    return { deliveryZoneId: zone.id, chargePoisha: zone.chargePoisha };
  }

  private async assertAreasAvailable(storeId: string, ids: number[], exceptId?: string) {
    if (!ids.length) return;
    const areas = await this.repository.findAreas(storeId, ids);
    if (areas.length !== ids.length || areas.some((area) => area.kind === 'division'))
      throw deliveryError('DELIVERY_AREA_INVALID');
    if (await this.repository.findConflict(storeId, ids, exceptId))
      throw deliveryError('DELIVERY_AREA_TAKEN');
  }
}

function toResponse(zone: DeliveryZone): DeliveryZoneResponse {
  return {
    ...zone,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}
