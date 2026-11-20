const banglaDigits = '০১২৩৪৫৬৭৮৯';
const numberPattern = /\d+(?:,\d+)*(?:\.\d+)?/g;
const listMarker = /^\s*\d+[.)]\s/gm;

// Every figure the owner reads must come from a tool result of this run (docs/rules/ai-and-llm.md rule 6).
export function numbersAreFromTools(reply: string, toolResults: readonly object[]): boolean {
  const known = numbersIn(toolResults);
  return [...numbersIn(reply.replace(listMarker, ''))].every((value) => known.has(value));
}

function numbersIn(value: unknown, found = new Set<number>()): Set<number> {
  if (typeof value === 'number') found.add(value);
  else if (typeof value === 'string')
    for (const [digits] of toAsciiDigits(value).matchAll(numberPattern))
      found.add(Number(digits.replaceAll(',', '')));
  else if (Array.isArray(value)) for (const item of value) numbersIn(item, found);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) numbersIn(item, found);
  return found;
}

const toAsciiDigits = (text: string) =>
  text.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
