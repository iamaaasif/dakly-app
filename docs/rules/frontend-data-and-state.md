# Data and state

Sources: [TanStack Query docs](https://tanstack.com/query/latest/docs/framework/react/overview) and TkDodo's [Practical React Query](https://tkdodo.eu/blog/practical-react-query) series (query key factories, no copying server data into state), and the Next.js guidance on [URL search params](https://nextjs.org/docs/app/api-reference/functions/use-search-params).

## Where state lives

| State                                                                               | Lives in                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Anything from the API                                                               | React Query cache                                                                     |
| Filters, tabs, search, sort, page, selected record id                               | The URL (`?stage=to_confirm&page=2`)                                                  |
| Form input                                                                          | React Hook Form                                                                       |
| Open dialog, hover, a local toggle                                                  | `useState` in the component that owns it                                              |
| UI state many distant components share (sidebar collapsed, composer draft per chat) | A small Zustand store in the feature, only when `useState` and the URL are not enough |

Never copy API data into `useState` or Zustand. Never use React context for server data.

## API calls

One file per endpoint in the feature's `api/` folder. It holds the fetch function, the query key and the hook.

```ts
// features/orders/api/get-orders.ts
import type { OrderListResponse, OrderListQuery } from '@dakly/contracts/orders';
import { apiGet } from '@/lib/api-client';

export const ordersKeys = {
  all: ['orders'] as const,
  list: (query: OrderListQuery) => [...ordersKeys.all, 'list', query] as const,
};

function getOrders(query: OrderListQuery) {
  return apiGet<OrderListResponse>('/orders', query);
}

export function useOrders(query: OrderListQuery) {
  return useQuery({ queryKey: ordersKeys.list(query), queryFn: () => getOrders(query) });
}
```

- Request and response types come from `@dakly/contracts`. Never redeclare an API type in the web app.
- All calls go through `lib/api-client.ts`, which sends the cookie, parses `{ error: { code, message } }` into `ApiError`, and never reads a store id from anywhere: the session decides the store.
- Query keys come from the feature's key object, never written inline twice.
- After a mutation, invalidate the keys it changed (`queryClient.invalidateQueries({ queryKey: ordersKeys.all })`). Optimistic updates only where the design needs instant feedback (sending a chat message, moving an order stage), with rollback on error.
- Show errors by code: the API's `message` is safe to show; map codes to a better sentence only where the screen needs it.
- Live updates (new chat messages, notifications) come from the Server-Sent Events stream, which updates the React Query cache. Do not poll a list every few seconds.

Wrong:

```ts
const [orders, setOrders] = useState([]);
useEffect(() => {
  fetch(`/api/orders?storeId=${storeId}`)
    .then((r) => r.json())
    .then(setOrders);
}, [storeId]);
```

Right:

```ts
const [query] = useOrdersQueryFromUrl();
const { data, isPending, error } = useOrders(query);
```

## Lists

Lists over 50 rows are paginated by the API with a cursor. Chat messages and the chat list use infinite queries. Large lists render with virtualisation (TanStack Virtual) only after they are measured as slow.
