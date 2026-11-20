import { useFormContext } from 'react-hook-form';

import type { CreatePostInput } from '@dakly/contracts/social';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

export function PostDetails({ hasInstagram }: { hasInstagram: boolean }) {
  const { register, formState } = useFormContext<CreatePostInput>();
  return (
    <section
      aria-label="Link and first comment"
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="post-link">Facebook link · optional</Label>
        <Input
          id="post-link"
          inputMode="url"
          placeholder="https://"
          aria-invalid={Boolean(formState.errors.linkUrl)}
          {...register('linkUrl', { setValueAs: (value: string | null) => value?.trim() || null })}
        />
        {formState.errors.linkUrl && (
          <p role="alert" className="text-sm text-danger">
            Enter a link that starts with http:// or https://
          </p>
        )}
      </div>
      {hasInstagram && (
        <div className="space-y-1.5">
          <Label htmlFor="post-first-comment">Instagram first comment · optional</Label>
          <Input
            id="post-first-comment"
            maxLength={2200}
            {...register('firstComment', {
              setValueAs: (value: string | null) => value?.trim() || null,
            })}
          />
        </div>
      )}
    </section>
  );
}
