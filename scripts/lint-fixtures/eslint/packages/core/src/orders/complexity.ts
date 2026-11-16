export function deliveryCharge(zone: number) {
  if (zone === 1) return 60;
  if (zone === 2) return 70;
  if (zone === 3) return 80;
  if (zone === 4) return 90;
  if (zone === 5) return 100;
  if (zone === 6) return 110;
  if (zone === 7) return 120;
  if (zone === 8) return 130;
  if (zone === 9) return 140;
  if (zone === 10) return 150;
  return 0;
}
