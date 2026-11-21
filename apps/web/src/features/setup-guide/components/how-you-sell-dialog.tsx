'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Facebook, Package, Store, Columns2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  howYouSellAnswersSchema,
  type SetupChecklistResponse,
} from '@dakly/contracts/setup-checklist';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Dialog } from '@dakly/ui/dialog';
import { useToast } from '@dakly/ui/toast';

import { useChangeSetupChecklist } from '../api/setup-checklist';

type Answer = SetupChecklistResponse['howYouSell'][number];
const formSchema = z.object({ howYouSell: howYouSellAnswersSchema });
type FormValues = z.infer<typeof formSchema>;

const options: { value: Answer; label: string; hint: string; icon: ReactNode }[] = [
  {
    value: 'social_media',
    label: 'Facebook or social media',
    hint: 'I sell through Facebook, Messenger, Instagram or WhatsApp.',
    icon: <Facebook size={20} />,
  },
  {
    value: 'online_store',
    label: 'Online store',
    hint: 'I use Shopify, WooCommerce or another online store.',
    icon: <Package size={20} />,
  },
  {
    value: 'shop_with_pos',
    label: 'Shop with a POS',
    hint: 'I use a billing or POS system for my sales.',
    icon: <Columns2 size={20} />,
  },
  {
    value: 'shop_without_pos',
    label: 'Shop without a POS',
    hint: 'I write sales by hand or in a notebook.',
    icon: <Store size={20} />,
  },
];

const extensionNames: Record<string, string> = {
  sales: 'Sales',
  chats: 'Chats',
  social_auto_post: 'Social Auto Post',
};

export function HowYouSellDialog(props: { open: boolean; answers: Answer[]; onClose: () => void }) {
  const { open, answers, onClose } = props;
  const showToast = useToast();
  const change = useChangeSetupChecklist();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: { howYouSell: answers },
  });

  async function save({ howYouSell }: FormValues) {
    const { turnedOn } = await change.mutateAsync({ howYouSell });
    onClose();
    showToast(turnedOnMessage(turnedOn));
  }

  return (
    <Dialog title="How do you sell?" open={open} onClose={onClose} closeDisabled={change.isPending}>
      <form onSubmit={form.handleSubmit(save)} className="space-y-4" noValidate>
        <p className="text-sm text-text-muted">
          Pick all that apply. Dakly turns on the right tools and shows the steps that fit.
        </p>
        <Controller
          control={form.control}
          name="howYouSell"
          render={({ field }) => (
            <div role="group" aria-label="How do you sell?" className="grid gap-3">
              {options.map((option) => (
                <AnswerToggle
                  key={option.value}
                  option={option}
                  on={field.value.includes(option.value)}
                  onToggle={() =>
                    field.onChange(
                      field.value.includes(option.value)
                        ? field.value.filter((item) => item !== option.value)
                        : [...field.value, option.value],
                    )
                  }
                />
              ))}
            </div>
          )}
        />
        <FormErrors messages={[form.formState.errors.howYouSell?.message, change.error?.message]} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={change.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={change.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AnswerToggle({
  option: { label, hint, icon },
  on,
  onToggle,
}: {
  option: (typeof options)[number];
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        on ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted text-text-muted"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{label}</span>
        <span className="block text-sm text-text-muted">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'rounded grid size-5 shrink-0 place-items-center border',
          on ? 'border-action bg-action text-on-primary' : 'border-input-border bg-surface',
        )}
      >
        {on && <Check size={14} />}
      </span>
    </button>
  );
}

function turnedOnMessage(turnedOn: string[]) {
  if (!turnedOn.length) return 'Dakly is set up for how you sell.';
  const names = turnedOn.map((extension) => extensionNames[extension] ?? extension);
  return `Dakly is set up for how you sell. Turned on: ${names.join(', ')}.`;
}

function FormErrors({ messages }: { messages: (string | undefined)[] }) {
  return messages.filter(Boolean).map((message) => (
    <p key={message} role="alert" className="text-sm text-danger">
      {message}
    </p>
  ));
}
