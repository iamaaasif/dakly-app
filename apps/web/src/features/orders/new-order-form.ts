import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';

import {
  createOrderFormSchema,
  type CreateOrderInput,
  type CreateOrderValues,
} from '@dakly/contracts/orders';

export const newOrderDefaults: CreateOrderValues = {
  buyer: { name: '' },
  recipient: { name: '', phone: '', address: '', areaId: 0, isBuyer: true },
  items: [],
};

const parseNewOrder = zodResolver(createOrderFormSchema);

// When the buyer is the recipient, the name on the form is both, so it is copied to the buyer.
export const resolveNewOrder: Resolver<CreateOrderValues, undefined, CreateOrderInput> = (
  values,
  context,
  options,
) =>
  parseNewOrder(
    values.recipient.isBuyer && 'name' in values.buyer
      ? { ...values, buyer: { name: values.recipient.name } }
      : values,
    context,
    options,
  );
