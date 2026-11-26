'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';

import type { ConversationResponse } from '@dakly/contracts/chats';
import {
  createConversationOrderFormSchema,
  type CreateConversationOrderInput,
  type CreateConversationOrderValues,
} from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';

import { MakeOrderFields } from './make-order-fields';
import { useCreateOrder } from '@/lib/order-entry/create-order';

type MakeOrderFormProps = { conversation: ConversationResponse; contactPhone: string | null };

// A masked phone has an X in it and cannot be saved as the delivery number.
const fullPhone = (phone: string | null) => (phone && /^\d+$/.test(phone) ? phone : '');

// The contact loads after the form mounts; fill the number unless staff already typed one.
function useFillPhone(
  form: UseFormReturn<CreateConversationOrderValues, undefined, CreateConversationOrderInput>,
  contactPhone: string | null,
) {
  useEffect(() => {
    const phone = fullPhone(contactPhone);
    if (phone && !form.getValues('recipient.phone')) form.setValue('recipient.phone', phone);
  }, [contactPhone, form]);
}

export function MakeOrderForm({ conversation, contactPhone }: MakeOrderFormProps) {
  const create = useCreateOrder<CreateConversationOrderInput>(
    `/conversations/${conversation.id}/orders`,
  );
  const form = useForm<CreateConversationOrderValues, undefined, CreateConversationOrderInput>({
    resolver: zodResolver(createConversationOrderFormSchema),
    defaultValues: {
      recipient: {
        name: conversation.contactName ?? '',
        phone: fullPhone(contactPhone),
        address: '',
        areaId: 0,
        isBuyer: true,
      },
      items: [{ variantId: '', quantity: 1, lineDiscountPoisha: 0 }],
    },
  });
  useFillPhone(form, contactPhone);
  const [placed, setPlaced] = useState<{ id: string; number: number } | null>(null);
  const busy = create.isPending || create.mustRetry;
  const save = (input: CreateConversationOrderInput) =>
    create.mutate(input, {
      onSuccess: (order) => {
        setPlaced({ id: order.id, number: order.number });
        form.reset();
      },
    });
  return (
    <FormProvider {...form}>
      <form
        aria-label="Make an order"
        className="space-y-3 border-t border-border p-4"
        onSubmit={(event) => {
          if (!create.mustRetry) return void form.handleSubmit(save)(event);
          event.preventDefault();
          if (create.variables) save(create.variables);
        }}
      >
        <h3 className="text-sm font-semibold tracking-wide text-text-muted uppercase">
          Make an order
        </h3>
        <fieldset disabled={busy} className="space-y-3">
          <MakeOrderFields />
        </fieldset>
        <MakeOrderFooter
          placed={placed}
          create={create}
          busy={busy}
          onConfirm={form.handleSubmit((input) => save({ ...input, confirm: true }))}
        />
      </form>
    </FormProvider>
  );
}

type MakeOrderFooterProps = {
  placed: { id: string; number: number } | null;
  create: ReturnType<typeof useCreateOrder<CreateConversationOrderInput>>;
  busy: boolean;
  onConfirm: () => void;
};

function MakeOrderFooter({ placed, create, busy, onConfirm }: MakeOrderFooterProps) {
  return (
    <>
      {placed ? (
        <p role="status">
          Order #{placed.number} created.{' '}
          <Link href={`/orders?selected=${placed.id}`} className="text-action underline">
            Open order
          </Link>
        </p>
      ) : null}
      {create.error ? (
        <p role="alert" className="text-danger">
          {create.mustRetry
            ? 'Could not confirm the save. Retry with the same order details.'
            : create.error.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={create.isPending} className="w-full">
          <ShoppingBag aria-hidden="true" size={16} />
          {create.mustRetry ? 'Retry save' : 'Create order'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onConfirm}>
          Create and confirm
        </Button>
      </div>
    </>
  );
}
