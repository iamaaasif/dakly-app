export function orderTotal(
  items: number,
  discount: number,
  delivery: number,
  advance: number,
  cod: number,
) {
  return items - discount + delivery - advance + cod;
}
