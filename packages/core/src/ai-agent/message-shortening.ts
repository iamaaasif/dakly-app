// The most one message adds to a prompt, whatever the customer sent. A huge or repeated paste
// cannot burn tokens or push the older chat out.
export const MESSAGE_LENGTH = 600;
const KEPT_NUMBERS = 4;
const NUMBER_PATTERN = /[0-9০-৯][0-9০-৯\s-]{2,}[0-9০-৯]|\b[0-9০-৯]{1,2}\b/g;

// A long message keeps its start and its end, where the ask usually is, and any numbers from the
// middle, such as a phone number or a size. The result is never longer than the limit, so
// shortening it again changes nothing.
export function shorten(text: string, limit = MESSAGE_LENGTH): string {
  if (text.length <= limit) return text;
  const room = limit - 3;
  const numbers = (
    text
      .slice(Math.floor(room * 0.6), text.length - Math.floor(room * 0.4))
      .match(NUMBER_PATTERN) ?? []
  ).map((value) => value.trim().replaceAll(/\s+/g, ' '));
  const kept = [...new Set(numbers)].slice(0, KEPT_NUMBERS).join(', ');
  const middle = kept ? `…[${kept}]…` : '…';
  const left = limit - middle.length;
  const head = Math.ceil(left * 0.6);
  return `${text.slice(0, head)}${middle}${text.slice(text.length - (left - head))}`;
}
