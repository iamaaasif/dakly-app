import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type RefObject } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import type { z } from 'zod';

import { orderStageChangeSchema, type OrderDetail } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { SheetDialog } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { cancelReasonLabels, onHoldReasonLabels } from '../order-labels';
import type { StageFormAction } from './order-stage-actions';

type StageValues = z.input<typeof orderStageChangeSchema>;
type StageInput = z.output<typeof orderStageChangeSchema>;

type OrderStageDialogProps = {
  order: OrderDetail;
  action: StageFormAction;
  stage: RefObject<HTMLSpanElement | null>;
};

export function OrderStageDialog({ order, action, stage }: OrderStageDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<StageValues, undefined, StageInput>({
    resolver: zodResolver(orderStageChangeSchema),
    defaultValues: { to: action },
  });
  const change = useOrderStage(() => {
    setOpen(false);
    requestAnimationFrame(() => stage.current?.focus());
  });
  const cancelling = action === 'cancelled';
  const label = cancelling ? 'Cancel order' : 'Put on hold';

  return (
    <SheetDialog
      title={cancelling ? `Cancel order #${order.number}?` : label}
      trigger={<Button variant="secondary">{label}</Button>}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          change.reset();
        }
        setOpen(next);
      }}
      pending={change.isPending}
    >
      <FormProvider {...form}>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((body) => change.mutate({ id: order.id, body }))}
        >
          <fieldset disabled={change.isPending} className="space-y-3">
            <StageReasonFields cancelling={cancelling} />
          </fieldset>
          {change.error && (
            <p role="alert" className="text-danger">
              {change.error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={change.isPending}
              variant={cancelling ? 'danger' : 'primary'}
            >
              {label}
            </Button>
          </div>
        </form>
      </FormProvider>
    </SheetDialog>
  );
}

function StageReasonFields({ cancelling }: { cancelling: boolean }) {
  const { register } = useFormContext<StageValues>();
  const reasons = Object.entries(cancelling ? cancelReasonLabels : onHoldReasonLabels);
  return (
    <>
      <FormField name="reason" label="Reason">
        {(props) => (
          <select
            {...props}
            className="min-h-10 w-full rounded-md border border-input-border bg-surface px-3 aria-invalid:border-danger"
            {...register('reason')}
          >
            <option value="">Choose a reason</option>
            {reasons.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        )}
      </FormField>
      {!cancelling && (
        <FormField name="followUpOn" label="Follow-up date (optional)">
          {(props) => (
            <Input
              {...props}
              type="date"
              {...register('followUpOn', {
                setValueAs: (value: string) => value || undefined,
              })}
            />
          )}
        </FormField>
      )}
    </>
  );
}
