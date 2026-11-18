import { z } from 'zod';

import type { bdAreaKinds } from './orders';

const name = z.string().trim().min(1).max(80);
const chargePoisha = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const areaId = z.number().int().positive().max(2147483647);
const queryAreaId = z.coerce.number().pipe(areaId);
const bdAreaIds = z
  .array(areaId)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, 'Repeated area');

export const createDeliveryZoneSchema = z.strictObject({
  name,
  chargePoisha,
  bdAreaIds: bdAreaIds.default([]),
  isDefault: z.boolean().default(false),
});
export const changeDeliveryZoneSchema = z
  .strictObject({
    name: name.optional(),
    chargePoisha: chargePoisha.optional(),
    bdAreaIds: bdAreaIds.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'Nothing to change');
export const deliveryZoneListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const areaListQuerySchema = z.strictObject({
  parentId: queryAreaId.optional(),
  cursor: queryAreaId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
export type ChangeDeliveryZoneInput = z.infer<typeof changeDeliveryZoneSchema>;
export type DeliveryZoneListQuery = z.infer<typeof deliveryZoneListQuerySchema>;
export type AreaListQuery = z.infer<typeof areaListQuerySchema>;
export type DeliveryZoneResponse = CreateDeliveryZoneInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export type DeliveryZoneListResponse = { items: DeliveryZoneResponse[]; nextCursor: string | null };
export type AreaResponse = {
  id: number;
  name: string;
  nameBn: string | null;
  parentId: number | null;
  kind: (typeof bdAreaKinds)[number];
};
export type AreaListResponse = { items: AreaResponse[]; nextCursor: number | null };
export type DeliveryChargeResponse = {
  deliveryZoneId: string;
  chargePoisha: number;
  district: string;
};
