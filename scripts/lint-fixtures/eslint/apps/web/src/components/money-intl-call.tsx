export const Price = ({ amount }: { amount: number }) => (
  <p>{Intl.NumberFormat('bn-BD').format(amount)}</p>
);
