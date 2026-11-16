export const Price = ({ amount }: { amount: number }) => (
  <p>{new Intl.NumberFormat('bn-BD').format(amount)}</p>
);
