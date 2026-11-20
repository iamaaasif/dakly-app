import type { UseFormReturn } from 'react-hook-form';

import type { ContentWriteInput } from '@dakly/contracts/content-writing';

import type { TopicIdea } from '../content-studio-labels';

export type GenerateInput = Extract<ContentWriteInput, { operation: 'generate' }>;
// The screen asks for an idea and notes; the API takes one topic.
export type GenerateValues = Omit<GenerateInput, 'topic'> & {
  idea: TopicIdea | null;
  notes: string;
};
export type GenerateForm = UseFormReturn<GenerateValues>;

export function requestOf({ idea, notes, ...rest }: GenerateValues): GenerateInput {
  const detail = notes.trim();
  const topic = idea && detail ? `${idea}: ${detail}` : (idea ?? (detail || undefined));
  // A product description is written from the saved product alone.
  return rest.kind === 'product_description' ? rest : { ...rest, topic };
}
