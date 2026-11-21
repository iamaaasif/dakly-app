import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { knowledgeAnswerMaxLength } from '@dakly/contracts/knowledge';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

// The server accepts an answer without a question; the form asks for both, and holds the
// keywords as one comma separated line.
export const answerSchema = z.strictObject({
  question: z.string().trim().min(1, 'Write what customers ask.').max(500),
  answer: z
    .string()
    .trim()
    .min(1, 'Write how Dakly should answer.')
    .max(knowledgeAnswerMaxLength)
    .refine((text) => !text.includes('\u0000'), 'Remove the null character'),
  keywords: z.string(),
});

export type AnswerFormValues = z.infer<typeof answerSchema>;

export function splitKeywords(line: string): string[] {
  const words = line
    .split(/[,،]/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set(words)];
}

export function AnswerFields() {
  const { register } = useFormContext<AnswerFormValues>();
  return (
    <>
      <FormField name="question" label="When a customer asks">
        {(control) => (
          <Input
            {...control}
            autoFocus
            placeholder="e.g. Showroom kothay?"
            {...register('question')}
          />
        )}
      </FormField>
      <FormField name="answer" label="Dakly replies">
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            placeholder="Write the answer in your own words"
            {...register('answer')}
          />
        )}
      </FormField>
      <FormField
        name="keywords"
        label="Also use it for these words"
        hint="Optional · separate with commas."
      >
        {(control) => (
          <Input
            {...control}
            placeholder="e.g. showroom, dokan kothay, শোরুম"
            {...register('keywords')}
          />
        )}
      </FormField>
    </>
  );
}
