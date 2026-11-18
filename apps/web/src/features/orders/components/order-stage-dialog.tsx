import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  codCollectedSchema,
  couriers,
  dispatchOrderSchema,
  orderStageChangeSchema,
  type OrderDetail,
} from '@dakly/contracts/orders';
import { takaInput } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { ordersKey } from '../api/orders';
import { cancelReasonLabels, courierLabels, onHoldReasonLabels } from '../order-labels';
import { stageActionLabels, type StageFormAction } from './order-stage-actions';
import { SessionDialog } from '@/components/session-dialog';
import { productsKeys } from '@/lib/product-queries';
import { useStoreRequest } from '@/lib/store-request';

const actionSchema = z.discriminatedUnion('to', [
  ...orderStageChangeSchema.options,
  dispatchOrderSchema.safeExtend({ to: z.literal('with_courier') }),
  codCollectedSchema.extend({ to: z.literal('cod'), amountPoisha: takaInput }),
]);
type ActionValues = z.input<typeof actionSchema>;
type ActionInput = z.output<typeof actionSchema>;

function defaultFields(action: StageFormAction, order: OrderDetail): Partial<ActionValues> {
  switch (action) {
    case 'cod':
      return { to: action, amountPoisha: (order.codAmountPoisha / 100).toFixed(2) };
    case 'partially_delivered':
      return {
        to: action,
        items: order.items.map(({ id, quantity }) => ({ itemId: id, quantity })),
      };
    default:
      return { to: action };
  }
}

type OrderStageDialogProps = { order: OrderDetail; action: StageFormAction; onClose: () => void };

export function OrderStageDialog({ order, action, onClose }: OrderStageDialogProps) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  const form = useForm<ActionValues, undefined, ActionInput>({
    resolver: zodResolver(actionSchema),
    defaultValues: defaultFields(action, order),
  });
  const mutation = useMutation({
    mutationFn: (input: ActionInput) => {
      if (input.to === 'with_courier') {
        const { courier, courierOtherName, trackingCode } = input;
        return request<OrderDetail>(`/orders/${order.id}/courier`, {
          body: { courier, courierOtherName, trackingCode },
        });
      }
      if (input.to === 'cod')
        return request<OrderDetail>(`/orders/${order.id}/cod-collected`, {
          body: { amountPoisha: input.amountPoisha },
        });
      return request<OrderDetail>(`/orders/${order.id}/stage`, { body: input });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ordersKey }),
        client.invalidateQueries({ queryKey: productsKeys.all }),
      ]);
      onClose();
    },
  });
  const title =
    action === 'cancelled' ? `Cancel order #${order.number}?` : stageActionLabels[action];
  return (
    <SessionDialog title={title} open onClose={onClose} closeDisabled={mutation.isPending}>
      <FormProvider {...form}>
        <form className="space-y-3" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
          <fieldset disabled={mutation.isPending} className="space-y-3">
            <StageFields action={action} order={order} />
          </fieldset>
          {mutation.error && (
            <p role="alert" className="text-danger">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>
              Back
            </Button>
            <Button
              type="submit"
              loading={mutation.isPending}
              variant={action === 'cancelled' ? 'danger' : 'primary'}
            >
              {stageActionLabels[action]}
            </Button>
          </div>
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

function StageFields({ action, order }: Omit<OrderStageDialogProps, 'onClose'>) {
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
        <label htmlFor="damaged-items">Damaged items</label>
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
  const { register } = useFormContext<ActionValues>();
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <select
          {...props}
          className="min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger"
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
