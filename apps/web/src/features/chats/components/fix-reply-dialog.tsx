import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import type { AiFeedbackItem } from '@dakly/contracts/ai-feedback';
import { Button } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';

import { useFixAiReply } from '../api/ai-feedback';
import { AnswerFields, answerSchema, splitKeywords } from './knowledge-answer-fields';
import { formError } from '@/lib/form-error';

// Starts from what the customer wrote and what Dakly said, so the team edits instead of typing.
export function FixReplyDialog({ item, onDone }: { item: AiFeedbackItem; onDone: () => void }) {
  const form = useForm({
    resolver: zodResolver(answerSchema),
    defaultValues: {
      question: item.customerQuestion ?? '',
      answer: item.replyText ?? '',
      keywords: '',
    },
  });
  const fix = useFixAiReply();
  const submit = form.handleSubmit(async (values) => {
    try {
      await fix.mutateAsync({
        messageId: item.messageId,
        ...values,
        keywords: splitKeywords(values.keywords),
      });
      onDone();
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return (
    <Dialog title="Write the right answer" open closeDisabled={fix.isPending} onClose={onDone}>
      <FormProvider {...form}>
        <form onSubmit={submit} aria-label="Write the right answer" className="space-y-3">
          <p className="text-text-muted">
            Dakly saves this in Knowledge and uses it the next time a customer asks.
          </p>
          <AnswerFields />
          {form.formState.errors.root ? (
            <p role="alert" className="text-sm text-danger">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="secondary" onClick={onDone} disabled={fix.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={fix.isPending}>
              Save and teach Dakly
            </Button>
          </div>
        </form>
      </FormProvider>
    </Dialog>
  );
}
