import { formatMoney } from '@dakly/contracts/money';

import type { ConfirmationOutcome, ConfirmationView } from './order-confirmation.service';

const STYLE = `body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
table{width:100%;border-collapse:collapse}td{padding:.25rem 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}
.total td{border-top:1px solid;font-weight:600}.actions{display:flex;gap:.75rem;margin-top:1.5rem}
button{flex:1;font-size:1.05rem;padding:.75rem 1rem}`;

const texts = {
  confirmed: ['অর্ডার নিশ্চিত হয়েছে', 'Order confirmed', 'দোকান শীঘ্রই পাঠানোর ব্যবস্থা করবে।'],
  cancelled: ['অর্ডার বাতিল হয়েছে', 'Order cancelled', 'দোকানকে জানিয়ে দেওয়া হয়েছে।'],
  closed: ['এই লিংক আর কাজ করে না', 'This link no longer works', 'দোকানের সঙ্গে যোগাযোগ করুন।'],
} as const;

export function confirmationPage(view: ConfirmationView): string {
  if (view.state === 'closed') return outcomePage('closed');
  const rows = view.items
    .map(
      ({ name, quantity, totalPoisha }) =>
        `<tr><td>${escapeHtml(name)} × ${quantity}</td><td>${formatMoney(totalPoisha)}</td></tr>`,
    )
    .join('');
  return layout(
    'অর্ডার নিশ্চিত করুন / Confirm your order',
    `<p>${escapeHtml(view.storeName)} · #${view.orderNumber}</p>
<table>${rows}<tr class="total"><td>মোট / Total</td><td>${formatMoney(view.totalPoisha)}</td></tr></table>
<p>ঠিকানা / Address: ${escapeHtml(view.address)}</p>
<p>ডেলিভারির সময় টাকা দেবেন। / Pay cash on delivery.</p>
<form method="post" action="">
<div class="actions"><button type="submit" formaction="?answer=confirm">নিশ্চিত করুন / Confirm</button>
<button type="submit" formaction="?answer=cancel">বাতিল / Cancel</button></div></form>`,
  );
}

export function outcomePage(outcome: ConfirmationOutcome): string {
  const [bangla, english, note] = texts[outcome];
  return layout(`${bangla} / ${english}`, `<p>${note}</p>`);
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="bn">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>${STYLE}</style></head>
<body><h1>${title}</h1>
${body}
</body>
</html>`;
}

// Product names and addresses are typed by shops and buyers.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
