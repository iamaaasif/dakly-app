import { type FormEvent, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { RestockStockInput } from '@dakly/contracts/restock-requests';

import { useRestockProduct } from '../api/restock-product';

export function useRestockSubmit(
  form: UseFormReturn<RestockStockInput>,
  waitingBySize: ReadonlyMap<string, number>,
  onClose: () => void,
) {
  const restock = useRestockProduct();
  // Sizes already saved by a failed try are skipped on the next one, and their people are still messaged.
  const saved = useRef(new Set<string>());
  const run = ({ quantities, notify }: RestockStockInput) => {
    const restocks = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([variantId, quantity]) => ({ variantId, quantity }));
    const restockedIds = new Set([...saved.current, ...restocks.map((item) => item.variantId)]);
    const notifyVariantIds = notify
      ? [...restockedIds].filter((id) => (waitingBySize.get(id) ?? 0) > 0)
      : [];
    const onSaved = (id: string) => {
      saved.current.add(id);
      form.setValue(`quantities.${id}`, 0);
    };
    restock.mutate({ restocks, notifyVariantIds, onSaved }, { onSuccess: onClose });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    if (saved.current.size === 0) return form.handleSubmit(run)(event);
    // The "enter at least one size" rule no longer applies once some stock is saved.
    event.preventDefault();
    run(form.getValues());
  };
  return { save, restock };
}
