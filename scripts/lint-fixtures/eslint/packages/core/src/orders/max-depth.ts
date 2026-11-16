export function firstReturned(orders: { items: { returned: boolean }[] }[], active: boolean) {
  if (active) {
    for (const order of orders) {
      for (const item of order.items) {
        if (item.returned) {
          return item;
        }
      }
    }
  }
  return undefined;
}
