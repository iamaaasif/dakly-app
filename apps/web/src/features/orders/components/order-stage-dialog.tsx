import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type RefObject } from 'react';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  codCollectedSchema,
  couriers,
  dispatchOrderSchema,
  orderStageChangeSchema,
  partialDeliveryFormSchema,
  type OrderDetail,
} from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { SheetDialog } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useCollectOrderCod } from '../api/collect-order-cod';
import { useDispatchOrder } from '../api/dispatch-order';
import { cancelReasonLabels, courierLabels, onHoldReasonLabels } from '../order-labels';
import { stageActionLabels, type StageFormAction } from './order-stage-actions';
import { takaInputFromPoisha } from '@/lib/format-money';

function actionSchema(items: OrderDetail['items']) {
  return z.discriminatedUnion('to', [
    partialDeliveryFormSchema(items),
    ...orderStageChangeSchema.options.filter(
      ({ shape }) => shape.to.value !== 'partially_delivered',
    ),
    dispatchOrderSchema.safeExtend({ to: z.literal('with_courier') }),
    codCollectedSchema.extend({ to: z.literal('cod'), amountPoisha: takaInput }),
  ]);
}
type ActionValues = z.input<ReturnType<typeof actionSchema>>;
type ActionInput = z.output<ReturnType<typeof actionSchema>>;

function defaultFields(action: StageFormAction, order: OrderDetail): Partial<ActionValues> {
  switch (action) {
    case 'cod':
      return { to: action, amountPoisha: takaInputFromPoisha(order.codAmountPoisha) };
    case 'partially_delivered':
      return {
        to: action,
        items: order.items.map(({ id }) => ({ itemId: id, quantity: 0 })),
      };
    default:
      return { to: action };
  }
}

type OrderStageDialogProps = {
  order: OrderDetail;
  action: StageFormAction;
  stage: RefObject<HTMLSpanElement | null>;
  primary: boolean;
  disabled: boolean;
};

export function OrderStageDialog({
  order,
  action,
  stage,
  primary,
  disabled,
}: OrderStageDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<ActionValues, undefined, ActionInput>({
    resolver: zodResolver(actionSchema(order.items)),
    defaultValues: defaultFields(action, order),
  });
  const { submit, pending, error, reset } = useStageSubmission(order.id, () => {
    setOpen(false);
    requestAnimationFrame(() => stage.current?.focus());
  });
  const label = stageActionLabels[action];
  const title = action === 'cancelled' ? `Cancel order #${order.number}?` : label;
  return (
    <SheetDialog
      title={title}
      trigger={
        <Button variant={primary ? 'primary' : 'secondary'} disabled={disabled}>
          {label}
        </Button>
      }
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset(defaultFields(action, order));
          reset();
        }
        setOpen(next);
      }}
      pending={pending}
    >
      <FormProvider {...form}>
        <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
          <fieldset disabled={pending} className="min-w-0 space-y-3 wrap-anywhere">
            <StageFields action={action} order={order} />
          </fieldset>
          {error && (
            <p role="alert" className="text-danger">
              {error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={pending}
              variant={action === 'cancelled' ? 'danger' : 'primary'}
            >
              {label}
            </Button>
          </div>
        </form>
      </FormProvider>
    </SheetDialog>
  );
}

function useStageSubmission(id: string, onSaved: () => void) {
  const stage = useOrderStage(onSaved);
  const dispatch = useDispatchOrder(id, onSaved);
  const cod = useCollectOrderCod(id, onSaved);

  function submit(input: ActionInput) {
    if (input.to === 'with_courier') {
      const { courier, courierOtherName, trackingCode } = input;
      dispatch.mutate({ courier, courierOtherName, trackingCode });
    } else if (input.to === 'cod') {
      cod.mutate({ amountPoisha: input.amountPoisha });
    } else {
      stage.mutate({ id, body: input });
    }
  }
  return {
    submit,
    pending: stage.isPending || dispatch.isPending || cod.isPending,
    error: stage.error ?? dispatch.error ?? cod.error,
    reset: () => {
      stage.reset();
      dispatch.reset();
      cod.reset();
    },
  };
}

function StageFields({ action, order }: Pick<OrderStageDialogProps, 'action' | 'order'>) {
  switch (action) {
    case 'with_courier':
      return <CourierFields />;
    case 'on_hold':
    case 'cancelled':
      return <StageReasonFields action={action} />;
    case 'returned':
      return <ReturnFields />;
    case 'partially_delivered':
      return <PartialFields items={order.items} />;
    case 'cod':
      return <StageInput name="amountPoisha" label="Amount collected (৳)" inputMode="decimal" />;
  }
}

function StageReasonFields({ action }: { action: 'on_hold' | 'cancelled' }) {
  const labelMap = action === 'on_hold' ? onHoldReasonLabels : cancelReasonLabels;
  return (
    <>
      <StageSelect
        name="reason"
        label="Reason"
        placeholder="Choose a reason"
        options={Object.entries(labelMap)}
      />
      {action === 'on_hold' && (
        <StageInput name="followUpOn" label="Follow-up date (optional)" type="date" />
      )}
    </>
  );
}

function ReturnFields() {
  const { setValue, control } = useFormContext<ActionValues>();
  const damaged = useWatch({ control, name: 'isDamaged' });
  return (
    <>
      <StageInput name="reason" label="Return reason" maxLength={200} />
      <div className="flex min-h-10 items-center gap-3 pl-2">
        <Checkbox
          id="damaged-items"
          checked={damaged ?? false}
          onCheckedChange={(value) => setValue('isDamaged', value === true)}
        />
        <label htmlFor="damaged-items">Damaged items. Skip restocking.</label>
      </div>
    </>
  );
}

function CourierFields() {
  const { control, unregister } = useFormContext<ActionValues>();
  const courier = useWatch({ control, name: 'courier' });
  return (
    <>
      <StageSelect
        name="courier"
        label="Courier"
        placeholder="Choose courier (optional)"
        options={couriers.map((name) => [name, courierLabels[name]])}
        onChange={(value) => {
          if (value !== 'other') unregister('courierOtherName');
        }}
      />
      {courier === 'other' && (
        <StageInput name="courierOtherName" label="Courier name" maxLength={100} />
      )}
      <StageInput name="trackingCode" label="Tracking code (optional)" maxLength={100} />
    </>
  );
}

function PartialFields({ items }: { items: OrderDetail['items'] }) {
  const { register } = useFormContext<ActionValues>();
  return (
    <>
      <p className="text-sm text-text-muted">
        Enter at least one delivered and one undelivered unit.
      </p>
      {items.map((item, index) => {
        const name = `items.${index}.quantity` as const;
        return (
          <FormField
            key={item.id}
            name={name}
            label={`${item.productName} · ${item.variantTitle} · delivered out of ${item.quantity}`}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={item.quantity}
                {...register(name, { valueAsNumber: true })}
              />
            )}
          </FormField>
        );
      })}
      <StageInput name="note" label="Delivery note" maxLength={200} />
    </>
  );
}

type StageInputProps = {
  name: 'reason' | 'followUpOn' | 'courierOtherName' | 'trackingCode' | 'note' | 'amountPoisha';
  label: string;
  inputMode?: 'decimal';
  type?: 'date';
  maxLength?: number;
};

function StageInput({ name, label, ...input }: StageInputProps) {
  const { register } = useFormContext<ActionValues>();
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <Input
          {...props}
          {...input}
          {...register(name, { setValueAs: (value: string) => value.trim() || undefined })}
        />
      )}
    </FormField>
  );
}

type StageSelectProps = {
  name: 'courier' | 'reason';
  label: string;
  placeholder: string;
  options: [string, string][];
  onChange?: (value: string) => void;
};

function StageSelect({ name, label, placeholder, options, onChange }: StageSelectProps) {
  const { register, control } = useFormContext<ActionValues>();
  const value = useWatch({ control, name });
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <select
          {...props}
          className="min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger"
          value={value ?? ''}
          {...register(name, {
            setValueAs: (value: string) => value || undefined,
            onChange: (event) => onChange?.(event.target.value),
          })}
        >
          <option value="">{placeholder}</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
