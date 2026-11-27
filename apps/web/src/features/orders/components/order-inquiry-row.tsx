import { formatMoney } from '@dakly/contracts/money';
import type { OrderInquiry } from '@dakly/contracts/order-inquiries';
import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';

import { rowActionClass, rowClass, rowLinkClass } from './order-row-styles';
import { ChannelLogo } from '@/components/channel-logo';
import { UrlLink } from '@/components/url-link';
import { formatDateTime, formatRelativeTime } from '@/lib/format-date';

const channelTiles: Record<OrderInquiry['channel'], string> = {
  messenger: 'bg-info-soft text-facebook',
  instagram: 'bg-danger-soft text-instagram',
  whatsapp: 'bg-success-soft text-success',
};
const channelNames: Record<OrderInquiry['channel'], string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};
const customerKinds: Record<OrderInquiry['customerKind'], string> = {
  new: 'New customer',
  repeat: 'Repeat customer',
  vip: 'VIP customer',
};

type OrderInquiryRowProps = { inquiry: OrderInquiry; canEdit: boolean };

// An inquiry is a chat that showed buying interest. Making the order happens in that chat, where
// the customer's messages and the product they asked about are.
export function OrderInquiryRow({ inquiry, canEdit }: OrderInquiryRowProps) {
  const { channel, product, lastMessageAt } = inquiry;
  const name = inquiry.contactName ?? 'Unknown customer';
  const href = `/chats?chat=${encodeURIComponent(inquiry.conversationId)}&panel=customer`;
  return (
    <li className={rowClass}>
      <span
        className={cn('grid size-9 shrink-0 place-items-center rounded-md', channelTiles[channel])}
      >
        <ChannelLogo channel={channel} size={16} />
        <span className="sr-only">{channelNames[channel]}</span>
      </span>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UrlLink href={href} data-row-link className={rowLinkClass}>
            {name}
          </UrlLink>
          {lastMessageAt ? (
            <time
              dateTime={lastMessageAt}
              title={formatDateTime(lastMessageAt)}
              className="text-xs text-text-muted tabular-nums"
            >
              {formatRelativeTime(lastMessageAt)}
            </time>
          ) : null}
          <Badge variant="neutral" className="rounded-full px-2.5 py-0.5 text-xs font-medium">
            {customerKinds[inquiry.customerKind]}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm wrap-anywhere text-text-muted">
          {product?.name ?? 'No product shown yet'}
        </p>
      </div>
      <div className="col-start-2 tabular-nums md:col-start-auto md:text-right">
        {product?.pricePoisha != null ? (
          <>
            <span className="block text-base font-bold text-text">
              {formatMoney(product.pricePoisha)}
            </span>
            <span className="block text-xs text-text-muted">Price shown in chat</span>
          </>
        ) : null}
      </div>
      {canEdit ? (
        <UrlLink
          href={href}
          aria-label={`Make order for ${name}`}
          className={`relative z-10 justify-self-end ${rowActionClass}`}
        >
          Make order
        </UrlLink>
      ) : null}
    </li>
  );
}
