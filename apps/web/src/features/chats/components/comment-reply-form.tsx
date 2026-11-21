import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import { commentReplySchema, type CommentReplyInput } from '@dakly/contracts/comments';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Textarea } from '@dakly/ui/textarea';

import { formError } from '@/lib/form-error';

type CommentReplyFormProps = {
  label: string;
  hint?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (input: CommentReplyInput) => Promise<unknown>;
  onCancel: () => void;
};

export function CommentReplyForm({
  label,
  hint,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: CommentReplyFormProps) {
  const form = useForm({
    resolver: zodResolver(commentReplySchema),
    defaultValues: { body: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      onCancel();
    } catch (error) {
      formError(error, form.setError);
    }
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} aria-label={label} className="space-y-2">
        <FormField name="body" label={label} hint={hint}>
          {(control) => (
            <Textarea {...control} rows={3} placeholder={placeholder} {...form.register('body')} />
          )}
        </FormField>
        {form.formState.errors.root ? (
          <p role="alert" className="text-sm text-danger">
            {form.formState.errors.root.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={form.formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
