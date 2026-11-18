import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { FormProvider, useForm, type FormState, type UseFormReturn } from 'react-hook-form';

import {
  editOrderFormSchema,
  type EditOrderInput,
  type EditOrderValues,
  type OrderDetail,
} from '@dakly/contracts/orders';
import { bdMobileSchema } from '@dakly/contracts/phone';
import { Button } from '@dakly/ui/button';
import { SheetDialog } from '@dakly/ui/sheet';

import { useEditOrder } from '../api/edit-order';
import { OrderEditorFields } from './order-editor-dialog';
import { takaInputFromPoisha } from '@/lib/format-money';

const resolveEdit = zodResolver(editOrderFormSchema);

export function EditOrderDialog({ order, disabled }: { order: OrderDetail; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const edit = useEditOrder();
  const form: UseFormReturn<EditOrderValues, undefined, EditOrderInput> = useForm({
    resolver: (values, context, options) =>
      resolveEdit(
        { ...values, items: form.getFieldState('items').isDirty ? values.items : undefined },
        context,
        options,
      ),
    defaultValues: orderDraft(order),
  });

  const { dirtyFields } = form.formState;
  const submit = form.handleSubmit((input) => {
    const body = editedFields(input, dirtyFields);
    if (body.recipient?.isBuyer !== undefined && !body.recipient.phone) {
      form.setError('recipient.phone', { message: 'Enter the new recipient’s phone.' });
      return;
    }
    edit.mutate({ id: order.id, body }, { onSuccess: () => setOpen(false) });
  });

  return (
    <SheetDialog
      title="Edit order"
      trigger={
        <Button variant="secondary" disabled={disabled}>
          Edit order
        </Button>
      }
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(orderDraft(order));
        else edit.reset();
        setOpen(next);
      }}
      pending={edit.isPending}
      className="flex max-h-[calc(100dvh-1rem)] max-w-2xl flex-col"
    >
      <FormProvider {...form}>
        <form className="flex min-h-0 flex-col gap-3" onSubmit={submit}>
          <div className="min-h-0 overflow-y-auto px-0.5">
            <fieldset disabled={edit.isPending} className="space-y-3">
              <OrderEditorFields order={order} />
            </fieldset>
          </div>
          {edit.error && (
            <p role="alert" className="text-danger">
              {edit.error.message}
            </p>
          )}
          <div className="flex shrink-0 justify-end">
            <Button type="submit" loading={edit.isPending}>
              Save order
            </Button>
          </div>
        </form>
      </FormProvider>
    </SheetDialog>
  );
}

function editedFields(
  input: EditOrderInput,
  changed: FormState<EditOrderValues>['dirtyFields'],
): EditOrderInput {
  const { recipient, items, deliveryChargePoisha, orderDiscountPoisha, advancePaidPoisha } = input;
  return {
    expectedUpdatedAt: input.expectedUpdatedAt,
    items,
    recipient: editedRecipient(recipient, changed.recipient),
    deliveryChargePoisha: changed.deliveryChargePoisha ? deliveryChargePoisha : undefined,
    orderDiscountPoisha: changed.orderDiscountPoisha ? orderDiscountPoisha : undefined,
    advancePaidPoisha: changed.advancePaidPoisha ? advancePaidPoisha : undefined,
  };
}

function editedRecipient(
  recipient: EditOrderInput['recipient'],
  changed: FormState<EditOrderValues>['dirtyFields']['recipient'],
): EditOrderInput['recipient'] {
  if (!recipient || !changed) return undefined;
  return {
    name: changed.name ? recipient.name : undefined,
    phone: changed.phone ? recipient.phone : undefined,
    address: changed.address ? recipient.address : undefined,
    areaId: changed.areaId ? recipient.areaId : undefined,
    isBuyer: changed.isBuyer ? recipient.isBuyer : undefined,
  };
}

function orderDraft(order: OrderDetail): EditOrderValues {
  return {
    expectedUpdatedAt: order.updatedAt,
    recipient: {
      name: order.recipientName,
      phone: bdMobileSchema.safeParse(order.recipientPhone).data,
      address: order.recipientAddress,
      isBuyer: order.isRecipientBuyer,
    },
    items: order.items.map(({ variantId, quantity, lineDiscountPoisha }) => ({
      variantId,
      quantity,
      lineDiscountPoisha,
    })),
    orderDiscountPoisha: takaInputFromPoisha(order.orderDiscountPoisha),
    advancePaidPoisha: takaInputFromPoisha(order.advancePaidPoisha),
  };
}
