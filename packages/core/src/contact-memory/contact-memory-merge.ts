import {
  contactMemorySchema,
  type ContactMemory,
  type ContactMemoryExtraction,
  type ContactMemoryFact,
} from '@dakly/contracts/contact-memory';

import type { MemoryWork } from './contact-memory.repository';

export const maxFacts = 40;

function sameFact(left: ContactMemoryFact, right: ContactMemoryFact): boolean {
  return left.kind === right.kind && left.value.toLowerCase() === right.value.toLowerCase();
}

// Facts the model named with an id we sent. A delivery area counts only from an order the
// customer received themselves.
function learnedFacts(work: MemoryWork, extraction: ContactMemoryExtraction): ContactMemoryFact[] {
  const messageAt = new Map(work.messages.map((message) => [message.id, message.at]));
  const orderAt = new Map(work.orders.map((order) => [order.id, order.at]));
  const selfDelivered = new Set(
    work.orders.filter((order) => order.deliveryArea).map(({ id }) => id),
  );
  return extraction.facts.flatMap((fact) => {
    const at = (fact.source === 'own_order' ? orderAt : messageAt).get(fact.sourceId);
    const wrongPlace = fact.kind === 'delivery_area' && !selfDelivered.has(fact.sourceId);
    return at && !wrongPlace ? [{ ...fact, at: at.toISOString() }] : [];
  });
}

// Staff facts and an edited summary always stay. The model's facts fill the room that is left,
// oldest dropped first.
export function mergeMemory(work: MemoryWork, extraction: ContactMemoryExtraction): ContactMemory {
  const staff = work.memory.facts.filter((fact) => fact.source === 'staff');
  const model: ContactMemoryFact[] = [];
  const stored = work.memory.facts.filter((fact) => fact.source !== 'staff');
  for (const fact of [...stored, ...learnedFacts(work, extraction)]) {
    if (![...staff, ...model].some((existing) => sameFact(existing, fact))) model.push(fact);
  }
  model.sort((left, right) => left.at.localeCompare(right.at));

  const summary = work.summaryEditedByStaff ? work.memory.summary : extraction.customerSummary;
  while (model.length) {
    const memory = { summary, facts: [...staff, ...model] };
    if (memory.facts.length <= maxFacts && contactMemorySchema.safeParse(memory).success)
      return memory;
    model.shift();
  }
  return { summary, facts: staff };
}
