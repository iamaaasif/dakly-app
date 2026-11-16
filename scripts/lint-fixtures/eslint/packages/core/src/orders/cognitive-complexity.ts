export function countReturns(orders: { items: { returned: boolean }[] }[], strict: boolean) {
  let count = 0;
  if (strict) {
    for (const order of orders) {
      if (order.items.length > 0) count += 1;
    }
  }
  if (!strict) {
    for (const order of orders) {
      if (order.items.length > 1) count += 1;
    }
  }
  if (count > 0) {
    for (const order of orders) {
      if (order.items.every((item) => item.returned)) count -= 1;
    }
  }
  return count;
}
