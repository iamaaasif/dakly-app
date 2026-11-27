import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { AreaSearchResult } from '@dakly/contracts/delivery';
import type { OrderCustomerLookup } from '@dakly/contracts/order-entry';
import type { CreateOrderValues } from '@dakly/contracts/orders';

export type Customer = NonNullable<OrderCustomerLookup['customer']>;
type FieldName = 'name' | 'phone' | 'address' | 'area';

// Fields a lookup or a pasted chat filled stay marked until staff change them.
function useFilledMarks() {
  const [filled, setFilled] = useState<ReadonlySet<FieldName>>(new Set());
  return {
    filled,
    mark: (...names: FieldName[]) => setFilled((now) => new Set([...now, ...names])),
    unmark: (name: FieldName) =>
      setFilled((now) => (now.has(name) ? new Set([...now].filter((one) => one !== name)) : now)),
  };
}

type Found = { name: string | null; phone: string | null; address: string | null };

// The form keeps the area id. The name shown for it lives here, beside the City choice.
export function useCustomerFill() {
  const form = useFormContext<CreateOrderValues>();
  const marks = useFilledMarks();
  const [area, setArea] = useState<AreaSearchResult | null>(null);
  const separate = useWatch({ control: form.control, name: 'recipient.isBuyer' }) === false;
  // Staff can type a different recipient, so then the top fields belong to the buyer.
  const paths = {
    name: separate ? 'buyer.name' : 'recipient.name',
    phone: separate ? 'buyer.phone' : 'recipient.phone',
    address: 'recipient.address',
  } as const;
  const options = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };

  function chooseArea(next: AreaSearchResult | null, isFill = false) {
    setArea(next);
    form.setValue('recipient.areaId', next?.id ?? 0, options);
    if (isFill) marks.mark('area');
    else marks.unmark('area');
  }
  // A pasted chat replaces what is there; a looked up customer never overwrites typing.
  function fillText(found: Found, force: boolean) {
    for (const name of ['name', 'phone', 'address'] as const) {
      const value = found[name];
      if (!value || (!force && form.getValues(paths[name]))) continue;
      form.setValue(paths[name], value, options);
      marks.mark(name);
    }
  }
  function applyCustomer(customer: Customer, force: boolean) {
    form.setValue('buyer', { contactId: customer.contactId });
    fillText(customer, force);
    if (customer.area && (force || !form.getValues('recipient.areaId')))
      chooseArea(customer.area, true);
  }
  return {
    area,
    separate,
    paths,
    filled: marks.filled,
    unmark: marks.unmark,
    chooseArea,
    applyCustomer,
  };
}
