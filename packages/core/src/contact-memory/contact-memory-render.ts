import {
  contactMemoryContextMaxBytes,
  renderedContactMemorySchema,
  type ContactMemory,
  type ContactMemoryFact,
} from '@dakly/contracts/contact-memory';

type CountTokens = (text: string) => Promise<number | undefined>;

const note = 'Remembered from earlier chats. Never a source for prices, stock or charges.';

function lines(summary: string, facts: ContactMemoryFact[]): string {
  return [
    note,
    ...(summary ? [`Summary: ${summary}`] : []),
    ...facts.map((fact) => `- ${fact.kind}: ${fact.value}`),
  ].join('\n');
}

function fitsBytes(text: string): boolean {
  return Buffer.byteLength(text) <= contactMemoryContextMaxBytes;
}

// Fewest-first: whole model facts, then the summary, then staff facts, so the stored staff facts
// survive as long as the cap allows. The stored memory is never changed here.
export async function renderContactMemory(
  memory: ContactMemory,
  countTokens: CountTokens,
): Promise<string | undefined> {
  if (!memory.summary && !memory.facts.length) return undefined;
  const staff = memory.facts.filter((fact) => fact.source === 'staff');
  const model = memory.facts
    .filter((fact) => fact.source !== 'staff')
    .sort((left, right) => right.at.localeCompare(left.at));
  let summary = memory.summary;
  for (;;) {
    const text = lines(summary, [...staff, ...model]);
    // Bytes cost nothing to count, so the tokenizer only sees text that already fits the byte cap.
    const tokenCount = fitsBytes(text) ? await countTokens(text) : Number.POSITIVE_INFINITY;
    // Without a tokenizer the cap cannot be checked, so no memory is better than unchecked memory.
    if (tokenCount === undefined) return undefined;
    if (renderedContactMemorySchema.safeParse({ text, tokenCount }).success) return text;
    if (model.length) model.pop();
    else if (summary) summary = summary.slice(0, Math.floor(summary.length / 2)).trimEnd();
    else if (staff.length) staff.shift();
    else return undefined;
  }
}
