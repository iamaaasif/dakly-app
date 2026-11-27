'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { FormProvider } from 'react-hook-form';

import { Button } from '@dakly/ui/button';

import { useNewOrder } from '../use-new-order';
import { OrderCustomerCard } from './order-customer-card';
import { OrderLinesCard } from './order-lines-card';
import { OrderNoteCard, OrderPaymentCard } from './order-payment-card';
import { OrderSummaryBar, OrderSummaryCard, rowsOf } from './order-summary-card';
import { StorePage } from '@/components/store-page';

export function NewOrderPage() {
  const state = useNewOrder();
  const { form, totals, create } = state;
  const rows = rowsOf({
    totals,
    deliveryPoisha: state.deliveryPoisha,
    discountPoisha: state.discountPoisha,
    advancePoisha: state.advancePoisha,
  });
  const warning = totals.discountTooLarge ? 'The discount is more than the items cost.' : undefined;
  const summary = { rows, cashToCollectPoisha: totals.cashToCollectPoisha, warning };
  return (
    <StorePage permission="canViewOrders">
      <FormProvider {...form}>
        <form
          noValidate
          onKeyDown={state.onKeyDown}
          onSubmit={(event) => {
            event.preventDefault();
            state.submit();
          }}
        >
          <NewOrderHeader
            dirty={state.dirty}
            busy={state.busy}
            creating={create.isPending}
            retry={create.mustRetry}
            confirming={state.confirmingDiscard}
            onConfirm={state.setConfirmingDiscard}
            onLeave={state.leave}
          />
          <div className="grid min-w-0 items-start gap-4 px-4 pt-6 pb-32 md:px-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:pb-8">
            <MainColumn state={state} />
            <div className="min-w-0 space-y-4 lg:sticky lg:top-20">
              <div className="hidden lg:block">
                <OrderSummaryCard {...summary} />
              </div>
              <fieldset disabled={state.busy}>
                <OrderNoteCard />
              </fieldset>
              <SaveError create={create} />
            </div>
          </div>
          <OrderSummaryBar {...summary} creating={create.isPending} onCreate={state.submit} />
        </form>
      </FormProvider>
    </StorePage>
  );
}

function MainColumn({ state }: { state: ReturnType<typeof useNewOrder> }) {
  const { order, quote, form } = state;
  return (
    <fieldset disabled={state.busy} className="min-w-0 space-y-4">
      <OrderLinesCard
        lines={order.lines}
        notice={order.notice}
        error={form.formState.errors.items ? 'Add at least one product.' : undefined}
        onAdd={order.add}
        onQuantity={order.setQuantity}
        onRemove={state.removeLine}
      />
      <OrderCustomerCard />
      <OrderPaymentCard
        quotePoisha={quote.chargePoisha}
        quoteError={quote.error}
        onRetryQuote={() => void quote.refetch()}
      />
    </fieldset>
  );
}

function SaveError({ create }: { create: ReturnType<typeof useNewOrder>['create'] }) {
  if (!create.error) return null;
  return (
    <p role="alert" className="text-danger">
      {create.mustRetry
        ? 'Could not confirm the save. Retry with the same order details.'
        : create.error.message}
    </p>
  );
}

type NewOrderHeaderProps = {
  dirty: boolean;
  busy: boolean;
  creating: boolean;
  retry: boolean;
  confirming: boolean;
  onConfirm: (confirming: boolean) => void;
  onLeave: () => void;
};

function NewOrderHeader({
  dirty,
  busy,
  creating,
  retry,
  confirming,
  onConfirm,
  onLeave,
}: NewOrderHeaderProps) {
  const leave = () => (dirty ? onConfirm(true) : onLeave());
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-8">
      <Link
        href="/orders"
        aria-label="Back to orders"
        onClick={(event) => {
          if (!dirty) return;
          event.preventDefault();
          onConfirm(true);
        }}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft aria-hidden="true" size={20} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-text">Create new order</h1>
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Discard this order?"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-base text-text">Discard this order?</span>
          <Button variant="secondary" size="sm" onClick={() => onConfirm(false)}>
            Keep editing
          </Button>
          <Button variant="danger" size="sm" onClick={onLeave}>
            Discard
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={leave}>
            Cancel
          </Button>
          <Button type="submit" loading={creating} className="hidden lg:inline-flex">
            {retry ? 'Retry save' : 'Create'}
          </Button>
        </div>
      )}
    </div>
  );
}
