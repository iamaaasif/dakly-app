import { useRouter } from 'next/navigation';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import type { CreateOrderInput, CreateOrderValues } from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
import { useToast } from '@dakly/ui/toast';

import { newOrderDefaults, resolveNewOrder } from './new-order-form';
import { useOrderLines, type OrderLine } from './new-order-lines';
import { newOrderTotals } from './new-order-totals';
import { useCreateOrder } from '@/lib/order-entry/create-order';
import { useOrderDelivery } from '@/lib/order-entry/get-delivery-charge';

const money = (value: string | undefined) => (value ? (takaInput.safeParse(value).data ?? 0) : 0);
type Form = UseFormReturn<CreateOrderValues, undefined, CreateOrderInput>;

// The amounts the summary shows. Delivery is the typed charge, or the zone's charge for the area.
function useOrderMoney(form: Form, lines: OrderLine[]) {
  const [areaId, charge, discount, advance] = useWatch({
    control: form.control,
    name: ['recipient.areaId', 'deliveryChargePoisha', 'orderDiscountPoisha', 'advancePaidPoisha'],
  });
  const quote = useOrderDelivery(areaId || undefined);
  const deliveryPoisha = charge ? money(charge) : (quote.chargePoisha ?? 0);
  const discountPoisha = money(discount);
  const advancePoisha = money(advance);
  const totals = newOrderTotals({ lines, discountPoisha, deliveryPoisha, advancePoisha });
  return { quote, totals, deliveryPoisha, discountPoisha, advancePoisha };
}

function useSubmitOrder(form: Form) {
  const router = useRouter();
  const showToast = useToast();
  const create = useCreateOrder();
  const busy = create.isPending || create.mustRetry;
  function save(input: CreateOrderInput) {
    create.mutate(input, {
      onSuccess: (saved) => {
        showToast(`Order #${saved.number} created`, {
          label: 'Create another',
          onClick: () => router.push('/orders/new'),
        });
        router.replace(`/orders?selected=${saved.id}`);
      },
    });
  }
  function submit() {
    if (create.mustRetry && create.variables) return save(create.variables);
    void form.handleSubmit(save)();
  }
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (!busy) submit();
  }
  return { create, busy, submit, onKeyDown };
}

function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

export function useNewOrder() {
  const router = useRouter();
  const showToast = useToast();
  const form = useForm<CreateOrderValues, undefined, CreateOrderInput>({
    resolver: resolveNewOrder,
    defaultValues: newOrderDefaults,
  });
  const order = useOrderLines();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const submit = useSubmitOrder(form);
  const amounts = useOrderMoney(form, order.lines);
  const dirty = order.lines.length > 0 || form.formState.isDirty;
  const { reset: clearSaveError } = submit.create;

  useEffect(() => {
    const items = order.lines.map(({ variantId, quantity }) => ({
      variantId,
      quantity,
      lineDiscountPoisha: 0,
    }));
    form.setValue('items', items, { shouldValidate: form.formState.isSubmitted });
    // A stock error is about the lines as they were saved, so it goes once a line changes.
    clearSaveError();
  }, [order.lines, form, clearSaveError]);
  useLeaveGuard(dirty);

  function removeLine(line: OrderLine, index: number) {
    order.remove(line.variantId);
    showToast(`${line.productName} removed`, {
      label: 'Undo',
      onClick: () => order.restore(line, index),
    });
  }
  return {
    form,
    order,
    ...submit,
    ...amounts,
    dirty,
    confirmingDiscard,
    setConfirmingDiscard,
    removeLine,
    leave: () => router.push('/orders'),
  };
}
