export function deliveryLabel(zone: string, charge: number, days: number, courier: string) {
  return `${zone} ${charge} ${days} ${courier}`;
}
