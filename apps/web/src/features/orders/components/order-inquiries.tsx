import type { OrderInquiryPage } from '@dakly/contracts/order-inquiries';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderInquiries } from '../api/order-tabs';
import { ordersSearch } from '../api/orders';
import type { OrdersNavigationQuery } from '../orders-url';
import { usePageTrail } from '../use-page-trail';
import { OrderInquiryRow } from './order-inquiry-row';
import { OrdersEmpty } from './orders-empty';
import { OrdersLoading } from './orders-loading';
import { OrdersPager } from './orders-pager';
import { Refreshing } from '@/components/refreshing';
import { useSessionContext } from '@/lib/session-context';
import { useUrlRouter } from '@/lib/use-url-query';

type OrderInquiriesProps = { query: OrdersNavigationQuery; total?: number };

export function OrderInquiries({ query, total }: OrderInquiriesProps) {
  const inquiries = useOrderInquiries({
    search: query.search,
    cursor: query.cursor,
    limit: query.limit,
  });
  const router = useUrlRouter();
  const trail = usePageTrail(query.cursor, (cursor) =>
    router.push(`/orders?${ordersSearch({ ...query, cursor })}`),
  );
  if (inquiries.isPending) return <OrdersLoading label="inquiries" />;
  if (inquiries.error)
    return (
      <QueryError
        message={inquiries.error.message}
        onRetry={() => void inquiries.refetch()}
        retryLabel="Retry inquiries"
      />
    );
  const { items, nextCursor } = inquiries.data;
  return (
    <Refreshing active={inquiries.isPlaceholderData}>
      {items.length === 0 ? <NoInquiries query={query} /> : <InquiryItems items={items} />}
      <OrdersPager
        shown={items.length}
        total={query.search ? undefined : total}
        trail={trail}
        nextCursor={nextCursor}
      />
    </Refreshing>
  );
}

function NoInquiries({ query }: { query: OrdersNavigationQuery }) {
  const hint = 'Chats where a customer shows buying interest wait here until you make the order.';
  if (!query.search) return <OrdersEmpty title="No inquiries right now" hint={hint} />;
  return (
    <OrdersEmpty
      title="No inquiries match"
      hint={hint}
      clearHref={`/orders?${ordersSearch({ tab: 'inquiries', limit: query.limit })}`}
    />
  );
}

function InquiryItems({ items }: { items: OrderInquiryPage['items'] }) {
  const canEdit = Boolean(useSessionContext().data?.currentStore?.canEditOrders);
  return (
    <ul aria-label="Inquiries" className="divide-y divide-border">
      {items.map((inquiry) => (
        <OrderInquiryRow key={inquiry.conversationId} inquiry={inquiry} canEdit={canEdit} />
      ))}
    </ul>
  );
}
