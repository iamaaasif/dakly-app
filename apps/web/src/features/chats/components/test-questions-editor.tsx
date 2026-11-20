import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';

import {
  MAX_TEST_QUESTIONS,
  MIN_TEST_QUESTIONS,
  saveTestQuestionsSchema,
  type SaveTestQuestionsInput,
  type TestQuestion,
} from '@dakly/contracts/ai-practice';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { useToast } from '@dakly/ui/toast';

import { useSaveTestQuestions } from '../api/test-questions';
import { formError } from '@/lib/form-error';

type TestQuestionsEditorProps = { saved: TestQuestion[]; failed: number[]; canEdit: boolean };

export function TestQuestionsEditor({ saved, failed, canEdit }: TestQuestionsEditorProps) {
  const form = useForm<SaveTestQuestionsInput>({
    resolver: zodResolver(saveTestQuestionsSchema),
    defaultValues: { questions: saved },
  });
  const rows = useFieldArray({ control: form.control, name: 'questions' });
  const save = useSaveTestQuestions();
  const showToast = useToast();
  const submit = form.handleSubmit(async ({ questions }) => {
    try {
      const result = await save.mutateAsync(questions);
      form.reset({ questions: result.questions });
      showToast('Test questions saved.');
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return (
    <form onSubmit={submit} aria-label="Test questions" className="space-y-3">
      <p className="text-sm text-text-muted">
        Before a channel goes live, Dakly answers each question as it would to a customer, and the
        answer must match yours in meaning. Add {MIN_TEST_QUESTIONS} to {MAX_TEST_QUESTIONS}.
      </p>
      {rows.fields.map((row, index) => (
        <QuestionRow
          key={row.id}
          form={form}
          index={index}
          disabled={!canEdit || save.isPending}
          failed={failed.includes(index)}
          onRemove={canEdit ? () => rows.remove(index) : undefined}
        />
      ))}
      {form.formState.errors.root ? (
        <p role="alert" className="text-sm text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={rows.fields.length >= MAX_TEST_QUESTIONS}
            onClick={() => rows.append({ question: '', expectedAnswer: '' })}
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
            Add question
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Save test questions
          </Button>
        </div>
      ) : null}
    </form>
  );
}

type QuestionRowProps = {
  form: UseFormReturn<SaveTestQuestionsInput>;
  index: number;
  disabled: boolean;
  failed: boolean;
  onRemove: (() => void) | undefined;
};

function QuestionRow({ form, index, disabled, failed, onRemove }: QuestionRowProps) {
  const errors = form.formState.errors.questions?.[index];
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        <span className="flex items-center gap-2">
          Question {index + 1}
          {onRemove ? (
            <Button
              variant="secondary"
              className="min-h-8 min-w-8 px-1.5 py-1"
              aria-label={`Remove question ${index + 1}`}
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" size={14} strokeWidth={1.75} />
            </Button>
          ) : null}
        </span>
      </legend>
      <label className="block space-y-1 text-sm">
        <span className="text-text-muted">Customer asks</span>
        <Input
          placeholder="e.g. Kurti M size koto?"
          aria-invalid={Boolean(errors?.question)}
          {...form.register(`questions.${index}.question`)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-text-muted">Dakly should answer</span>
        <Input
          placeholder="e.g. ৳1,850, M is in stock"
          aria-invalid={Boolean(errors?.expectedAnswer)}
          {...form.register(`questions.${index}.expectedAnswer`)}
        />
      </label>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          Dakly did not give this answer in the last check.
        </p>
      ) : null}
    </fieldset>
  );
}
