import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { knowledgeAnswerMaxLength } from '@dakly/contracts/knowledge';
import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { useSaveKnowledgeAnswer } from '../api/knowledge-items';
import { formError } from '@/lib/form-error';

// The server accepts an answer without a question; the form asks for both, and holds the
// keywords as one comma separated line.
const answerSchema = z.strictObject({
  question: z.string().trim().min(1, 'Write what customers ask.').max(500),
  answer: z
    .string()
    .trim()
    .min(1, 'Write how Dakly should answer.')
    .max(knowledgeAnswerMaxLength)
    .refine((text) => !text.includes('\u0000'), 'Remove the null character'),
  keywords: z.string(),
});

type AnswerFormValues = z.infer<typeof answerSchema>;

function splitKeywords(line: string): string[] {
  const words = line
    .split(/[,،]/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set(words)];
}

function AnswerFields() {
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

type KnowledgeAnswerFormProps = {
  id: string | null;
  question: string;
  answer: string;
  keywords: string[];
  onDone: () => void;
};

export function KnowledgeAnswerForm({
  id,
  question,
  answer,
  keywords,
  onDone,
}: KnowledgeAnswerFormProps) {
  const form = useForm({
    resolver: zodResolver(answerSchema),
    defaultValues: { question, answer, keywords: keywords.join(', ') },
  });
  const save = useSaveKnowledgeAnswer();
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id, ...values, keywords: splitKeywords(values.keywords) });
      onDone();
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return (
    <Dialog
      title={id ? 'Edit answer' : 'Teach Dakly an answer'}
      open
      closeDisabled={save.isPending}
      onClose={onDone}
    >
      <FormProvider {...form}>
        <form
          onSubmit={submit}
          aria-label={id ? 'Edit answer' : 'Add answer'}
          className="space-y-3"
        >
          <AnswerFields />
          {form.formState.errors.root ? (
            <p role="alert" className="text-sm text-danger">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save answer
            </Button>
          </div>
        </form>
      </FormProvider>
    </Dialog>
  );
}
