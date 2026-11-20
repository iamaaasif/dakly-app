import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { changeKnowledgeItemSchema } from '@dakly/contracts/knowledge';
import { Button } from '@dakly/ui/button';
import { Textarea } from '@dakly/ui/textarea';

import { useSaveKnowledgeAnswer } from '../api/knowledge-items';
import { formError } from '@/lib/form-error';

// The first option of the change schema is the answer-only shape.
const answerSchema = changeKnowledgeItemSchema.options[0];

type KnowledgeAnswerFormProps = {
  id: string | null;
  answer: string;
  onDone: () => void;
};

export function KnowledgeAnswerForm({ id, answer, onDone }: KnowledgeAnswerFormProps) {
  const form = useForm({ resolver: zodResolver(answerSchema), defaultValues: { answer } });
  const save = useSaveKnowledgeAnswer();
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id, answer: values.answer });
      onDone();
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return (
    <form
      onSubmit={submit}
      aria-label={id ? 'Edit answer' : 'Add answer'}
      className="space-y-3 rounded-lg border border-border p-3"
    >
      <p className="text-sm text-text-muted">
        Write what Dakly should tell customers, as you would say it. Dakly finds it when a customer
        asks about it.
      </p>
      <Textarea
        aria-label="Answer"
        rows={4}
        autoFocus
        aria-invalid={Boolean(form.formState.errors.answer)}
        placeholder="e.g. Our showroom is at House 12, Road 5, Dhanmondi. Open 10 am to 10 pm."
        {...form.register('answer')}
      />
      {form.formState.errors.answer ? (
        <p role="alert" className="text-sm text-danger">
          {form.formState.errors.answer.message}
        </p>
      ) : null}
      {form.formState.errors.root ? (
        <p role="alert" className="text-sm text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          Save answer
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
