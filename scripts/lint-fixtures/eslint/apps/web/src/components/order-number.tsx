// A `#` before a value in a template is not a colour.
export const OrderNumber = ({ number }: { number: string }) => <p>{`Order #${number}`}</p>;
