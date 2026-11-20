'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';

import { contentWriteRequestSchema } from '@dakly/contracts/content-writing';
import { Button } from '@dakly/ui/button';

import { useWriteContent } from '../api/write-content';
import { kindChoices } from '../content-studio-labels';
import { ChoiceChips } from './choice-chips';
import type { GenerateInput } from './generate-form-types';
import { ProductField } from './product-field';
import { StyleFields } from './style-fields';
import { TopicField } from './topic-field';
import { WrittenOptions } from './written-options';

export function CreateTab() {
  const form = useForm<GenerateInput>({
    // The schema is a union over operations; this form only ever generates.
    resolver: zodResolver(contentWriteRequestSchema) as Resolver<GenerateInput>,
    defaultValues: {
      operation: 'generate',
      kind: 'facebook_post',
      tone: 'friendly',
      language: 'bn',
    },
  });
  const [asked, setAsked] = useState<GenerateInput | null>(null);
  const write = useWriteContent();
  const { errors } = form.formState;
  const kind = form.watch('kind');
  const problem = errors.productId?.message ?? errors.topic?.message ?? write.error?.message;
  const submit = form.handleSubmit((input) => {
    setAsked(input);
    write.mutate(input);
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <form
        onSubmit={submit}
        noValidate
        className="space-y-5 rounded-lg border border-border bg-surface p-4"
      >
        <ChoiceChips
          legend="What do you want to write?"
          name="kind"
          value={kind}
          choices={kindChoices}
          onChange={(value) => form.setValue('kind', value)}
        />
        {kind !== 'product_description' && <TopicField form={form} />}
        <ProductField form={form} required={kind === 'product_description'} />
        <StyleFields form={form} />
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        <Button type="submit" loading={write.isPending}>
          <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
          {write.isError ? 'Try again' : 'Write 3 options'}
          <span className="text-xs font-normal opacity-80">Uses 3 AI credits</span>
        </Button>
      </form>
      <WrittenOptions result={write.data} asked={asked} />
    </div>
  );
}
