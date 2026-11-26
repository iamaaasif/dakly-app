export type CompactDeliveryZone = { name: string; chargeTaka: number };

export const shopBlock = (
  shop: {
    name: string;
    phone: string | null;
    address: string | null;
    district: string | null;
  },
  deliveryZones: readonly CompactDeliveryZone[],
) =>
  `<shop>${JSON.stringify({
    name: shop.name,
    phone: shop.phone,
    address: shop.address,
    district: shop.district,
    ...(deliveryZones?.length ? { deliveryZones } : {}),
  })}</shop>`;

export const summaryOf = (result: object) =>
  'summary' in result && typeof result.summary === 'string' ? result.summary : undefined;
