import type { handoverReasons } from '@dakly/contracts/chats';

type Reason = (typeof handoverReasons)[number];

const ISSUE_LIMIT = 200;
const banglaDigits = (text: string) =>
  text.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));

const phonePattern = /(?:\+?880|0)1[3-9](?:[\s-]?\d){8}/;
const orderPattern =
  /(?:order(?:\s*(?:number|no|id|#))?|অর্ডার\s*(?:নম্বর|নং)?)\s*[:#-]?\s*([a-z0-9-]{2,20})/iu;
const namePattern =
  /(?:amar\s+nam|my\s+name\s+is|name\s*[:=-]|আমার\s+নাম)\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+){0,2})/iu;

function extractFields(text: string) {
  const ascii = banglaDigits(text);
  const name = text.match(namePattern)?.[1]?.trim();
  const phone = ascii.match(phonePattern)?.[0]?.replace(/[\s-]+/g, '');
  const orderId = ascii.match(orderPattern)?.[1]?.trim();
  return [
    name ? `Customer: ${name}` : '',
    phone ? `Phone: ${phone}` : '',
    orderId ? `Order: #${orderId}` : '',
  ].filter(Boolean);
}

export function formatHandoverSummary({
  reason,
  summary,
  latestText,
}: {
  reason: Reason;
  summary?: string;
  latestText?: string | null;
}) {
  const modelSummary = summary?.trim();
  if (modelSummary) return modelSummary;
  const text = latestText?.trim() ?? '';
  if (!text) return `Reason: ${reason}`;
  return [`Reason: ${reason}`, ...extractFields(text), `Issue: ${text.slice(0, ISSUE_LIMIT)}`].join(
    ' | ',
  );
}
