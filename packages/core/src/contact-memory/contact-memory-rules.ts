import {
  contactMemoryContextMaxBytes,
  contactMemoryContextMaxTokens,
  contactMemorySchema,
  type ContactMemory,
  type ContactMemoryFact,
} from '@dakly/contracts/contact-memory';

const MAX_FACTS = 40;
const SUMMARY_MAX = 600;
const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const encoder = new TextEncoder();

export type ContactMemoryTokenCounter = (text: string) => number;

export const utf8Bytes = (text: string) => encoder.encode(text).length;

// A long digit run is a phone, card or account number; payment words cover the rest. The model is
// told the same, but a stored fact must never depend on the model obeying.
export function isStorableFactValue(value: string): boolean {
  const digits = Array.from(value, (character) => {
    const banglaIndex = BANGLA_DIGITS.indexOf(character);
    return banglaIndex >= 0 ? String(banglaIndex) : character;
  }).join('');
  if (/\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d/.test(digits)) return false;
  return !/\b(otp|pin|cvv|password|bkash|nagad|rocket|card|trxid|transaction id)\b/i.test(value);
}

const sameFact = (a: ContactMemoryFact, b: ContactMemoryFact) =>
  a.kind === b.kind && a.value.trim().toLowerCase() === b.value.trim().toLowerCase();

// Staff facts and a staff-edited summary survive every merge. Model facts lose the oldest first
// when the count or the serialized size passes its limit.
export function mergeContactMemory(
  current: ContactMemory,
  extracted: readonly ContactMemoryFact[],
  proposal: { summary: string; keepSummary: boolean },
): ContactMemory {
  const kept = [...current.facts];
  for (const fact of extracted) {
    if (!isStorableFactValue(fact.value) || fact.source === 'staff') continue;
    const index = kept.findIndex((existing) => sameFact(existing, fact));
    const existing = kept[index];
    if (!existing) kept.push(fact);
    else if (existing.source !== 'staff') kept[index] = fact.at > existing.at ? fact : existing;
  }
  const summary = proposal.keepSummary ? current.summary : proposal.summary.slice(0, SUMMARY_MAX);
  const facts = fitFacts(kept, summary);
  return { summary, facts };
}

function fitFacts(facts: ContactMemoryFact[], summary: string): ContactMemoryFact[] {
  const droppable = facts
    .filter((fact) => fact.source !== 'staff')
    .sort((a, b) => a.at.localeCompare(b.at));
  const remaining = new Set(facts);
  const fits = () =>
    remaining.size <= MAX_FACTS &&
    contactMemorySchema.safeParse({ summary, facts: [...remaining] }).success;
  for (const fact of droppable) {
    if (fits()) break;
    remaining.delete(fact);
  }
  return facts.filter((fact) => remaining.has(fact));
}

const priority = (fact: ContactMemoryFact) => (fact.source === 'staff' ? 0 : 1);

function renderText(summary: string, facts: readonly ContactMemoryFact[]): string {
  const lines = ['Customer memory. Context only, never a source for prices, stock or charges.'];
  if (summary) lines.push(`Summary: ${summary}`);
  for (const fact of facts) lines.push(`- ${fact.kind}: ${fact.value}`);
  return lines.join('\n');
}

const fitsLimits = (rendered: { text: string; tokenCount: number }) =>
  utf8Bytes(rendered.text) <= contactMemoryContextMaxBytes &&
  rendered.tokenCount <= contactMemoryContextMaxTokens;

// Drops whole model facts first, then staff facts from the rendered copy only, then shortens the
// summary. The stored memory is never touched.
function shrinkToFit(
  summary: string,
  allFacts: readonly ContactMemoryFact[],
  countTokens: ContactMemoryTokenCounter,
) {
  const facts = [...allFacts].sort((a, b) => priority(a) - priority(b) || b.at.localeCompare(a.at));
  let text = summary;
  const measure = () => {
    const rendered = renderText(text, facts);
    return { text: rendered, tokenCount: countTokens(rendered) };
  };
  let rendered = measure();
  while (!fitsLimits(rendered) && facts.length > 0) {
    const index = facts.findLastIndex((fact) => fact.source !== 'staff');
    facts.splice(index === -1 ? facts.length - 1 : index, 1);
    rendered = measure();
  }
  while (!fitsLimits(rendered) && text.length > 0) {
    text = text.slice(0, Math.floor(text.length / 2)).trimEnd();
    rendered = measure();
  }
  return { rendered, empty: !text && facts.length === 0 };
}

// Returns null when nothing fits or the tokenizer is missing: no memory beats an estimated cap.
export function renderContactMemory(
  memory: ContactMemory,
  countTokens: ContactMemoryTokenCounter | null,
): { text: string; tokenCount: number } | null {
  if (!countTokens || (!memory.summary && memory.facts.length === 0)) return null;
  const { rendered, empty } = shrinkToFit(memory.summary, memory.facts, countTokens);
  return fitsLimits(rendered) && !empty ? rendered : null;
}
