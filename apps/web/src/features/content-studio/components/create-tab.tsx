'use client';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@dakly/ui/button';

import { useWriteContent } from '../api/write-content';
import { CreditsNote } from './credits-note';
import { requestOf, type GenerateInput, type GenerateValues } from './generate-form-types';
import { KindPicker } from './kind-picker';
import { ProductField } from './product-field';
import { StyleFields } from './style-fields';
import { NotesField, TopicFields } from './topic-fields';
import { writeResolver } from './write-resolver';
import { WrittenOptions } from './written-options';

function submitLabel(written: boolean, failed: boolean): string {
  if (failed) return 'Try again';
  return written ? 'Write 3 new options' : 'Write 3 options';
}

export function CreateTab() {
  const form = useForm<GenerateValues>({
    resolver: writeResolver,
    defaultValues: {
      operation: 'generate',
      kind: 'facebook_post',
      tone: 'friendly',
      language: 'bn',
      length: 'medium',
      hashtags: true,
      orderLine: true,
      idea: 'New arrival',
      notes: '',
    },
  });
  const [asked, setAsked] = useState<GenerateInput | null>(null);
  const write = useWriteContent();
  const { errors } = form.formState;
  const isProduct = form.watch('kind') === 'product_description';
  const problem = errors.productId?.message ?? errors.notes?.message ?? write.error?.message;
  const submit = form.handleSubmit((values) => {
    const input = requestOf(values);
    setAsked(input);
    write.mutate(input);
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,7fr)]">
      <form
        onSubmit={submit}
        noValidate
        className="space-y-5 rounded-lg border border-border bg-surface p-4 md:p-5"
      >
        <KindPicker form={form} />
        {!isProduct && <TopicFields form={form} />}
        <ProductField form={form} required={isProduct} />
        {!isProduct && <NotesField form={form} />}
        <StyleFields form={form} />
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        <Button type="submit" loading={write.isPending} className="w-full">
          {write.data ? (
            <RefreshCw aria-hidden="true" size={16} strokeWidth={1.75} />
          ) : (
            <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
          )}
          {submitLabel(Boolean(write.data), write.isError)}
        </Button>
        <CreditsNote />
      </form>
      <WrittenOptions result={write.data} asked={asked} form={form} />
    </div>
  );
}
