const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
// The extension table: each of these takes an escape plus the character, two septets.
const GSM7_EXTENSION = new Set('^{}\\[]~|€\f');

// One part holds 160 GSM-7 or 70 Unicode characters (feature 09). A longer text is
// split with a header in every part, which leaves 153 or 67.
const PART_LIMITS = {
  gsm7: { single: 160, multipart: 153 },
  unicode: { single: 70, multipart: 67 },
} as const;

export function countSmsParts(text: string): number {
  let septets = 0;
  for (const character of text) {
    if (GSM7_BASIC.has(character)) septets += 1;
    else if (GSM7_EXTENSION.has(character)) septets += 2;
    else return partsFor(text.length, PART_LIMITS.unicode);
  }
  return partsFor(septets, PART_LIMITS.gsm7);
}

function partsFor(units: number, limits: { single: number; multipart: number }): number {
  return units <= limits.single ? 1 : Math.ceil(units / limits.multipart);
}
