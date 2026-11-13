# Components

Sources: the React docs ([Thinking in React](https://react.dev/learn/thinking-in-react), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)), [shadcn/ui](https://ui.shadcn.com/docs) for composition, and Bulletproof React's component guidance.

## Do and don't

| Don't                                                                    | Do                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| A 400-line component that fetches, filters, renders a table and a dialog | Split by job: screen (data + layout), list, row, dialog. Each under about 150 lines |
| `useEffect` to compute a value from props or state                       | Compute it during render; `useMemo` only after measuring a slow render              |
| `useEffect` to fetch data                                                | A React Query hook from the feature's `api/` folder                                 |
| `useEffect` to react to a click                                          | Do the work in the event handler                                                    |
| Copying props into state (`useState(props.order)`)                       | Read the prop; key the component to reset it                                        |
| A boolean prop for every variant (`isPrimary`, `isSmall`, `isDanger`)    | One `variant` prop with a string union, defined with `cva` in `packages/ui`         |
| Passing 10 props through 3 levels                                        | Compose with `children`, or let the lower component call its own hook               |
| `any` props, `React.FC`, `defaultProps`                                  | A typed props object and default values in the parameter list                       |
| Index as `key` in a list that can change                                 | A stable id                                                                         |
| Building a dropdown, dialog, tooltip or table from `div`s                | The `packages/ui` component (Radix primitives underneath)                           |
| A new generic component inside a feature                                 | `packages/ui`, after it is needed in a third place                                  |
| Inline money or date formatting (`'৳' + amount / 100`)                   | `formatMoney(amountPoisha)`, `formatDate(date)` from `lib/`                         |
| `dangerouslySetInnerHTML` with customer or AI text                       | Render as text. Customer messages, names and AI output are untrusted                |

## Shape of a component

```tsx
type OrderRowProps = {
  order: OrderListItem;
  onOpen: (orderId: string) => void;
};

export function OrderRow({ order, onOpen }: OrderRowProps) {
  return (
    <TableRow onClick={() => onOpen(order.id)}>
      <TableCell>#{order.number}</TableCell>
      <TableCell>{order.customerName}</TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(order.totalPoisha)}</TableCell>
      <TableCell>
        <OrderStageBadge stage={order.stage} />
      </TableCell>
    </TableRow>
  );
}
```

- Props come first as a type, then the component, then nothing else in the file except small private sub-components it alone uses.
- Early return for loading, empty and error states, at the top.
- Event handler props are named `on<Event>`; the handler inside is `handle<Event>`.
- No logic in JSX beyond a simple condition or a `map`. Move anything longer into a named variable above the `return`.

## Every list and screen has four states

Loading (skeleton the shape of the content), empty (one sentence and the next action, for example "No orders yet. Share your order link."), error (what went wrong in plain words and a Retry button), and the data. A screen missing one of these is not done.

## AI content in the UI

- Anything the AI wrote or sent shows the AI badge (`--color-ai`).
- AI-written drafts (posts, campaigns) show "Needs your OK" until approved (D7).
- Show the facts the AI used where the design has space ("Based on: price ৳1,250, Mirpur zone ৳60").

## Tests

Test components the way a person uses them, with Testing Library: find by role and label, click, assert what shows. Do not test props passed to children or internal state. Snapshot tests are not used.
