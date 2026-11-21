import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

import { useSaveKnowledgeAnswer } from '../api/knowledge-items';
import { AnswerFields, answerSchema, splitKeywords } from './knowledge-answer-fields';
import { formError } from '@/lib/form-error';

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
