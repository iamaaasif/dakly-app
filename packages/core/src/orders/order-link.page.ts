import { formatMoney } from '@dakly/contracts/money';

import { escapeHtml } from './order-confirmation.page';
import type { OrderLinkView } from './order-link.service';

// Served without the web app's stylesheet, so the values repeat the theme tokens in
// docs/design/theme.md: background, surface, surface-muted, border, text, text-muted, action,
// on-primary, input-border, danger, danger-soft, success, success-soft.
const STYLE = `:root{--background:#FAF9F5;--surface:#FFFFFF;--muted:#F3EFEB;--border:#EEE8E3;--text:#211A16;--text-muted:#766C65;--action:#C24F04;--on-primary:#FFFFFF;--input-border:#8F8178;--danger:#B4231A;--danger-soft:#FDECEA;--success:#14663D;--success-soft:#E6F4EC}
*{box-sizing:border-box}input{accent-color:var(--action)}body{margin:0;background:var(--background);color:var(--text);font:14px/22px system-ui,sans-serif}
main{max-width:34rem;margin:0 auto;padding:1rem 1rem 2rem}
header{display:flex;align-items:center;gap:.75rem;padding:.5rem 0 1rem}
.mark{display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:50%;background:var(--muted);font-weight:600}
h1{margin:0;font-size:20px;line-height:28px}h2{margin:0 0 .5rem;font-size:16px;line-height:24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:.75rem;padding:1rem;margin-bottom:1rem}
.photo{display:block;width:100%;max-height:22rem;object-fit:cover;border-radius:.5rem;margin-bottom:.75rem}
.price{font-size:20px;font-weight:600}.hint{color:var(--text-muted);font-size:13px;line-height:20px}
.variant{display:flex;justify-content:space-between;gap:.75rem;padding:.75rem;margin-bottom:.5rem;border:1px solid var(--input-border);border-radius:.5rem}
.variant:has(input:checked){background:var(--muted);border-color:var(--action)}.variant.soldout{color:var(--text-muted)}
.variant label{display:flex;gap:.5rem;flex:1}.low{color:var(--danger);font-size:12px;line-height:18px;font-weight:500}
label.field{display:block;margin-bottom:.75rem;font-weight:500}
input[type=text],input[type=tel],select,textarea{display:block;width:100%;margin-top:.25rem;padding:.625rem .75rem;font:inherit;border:1px solid var(--input-border);border-radius:.5rem;background:var(--surface);color:var(--text)}
textarea{min-height:4.5rem}:focus-visible{outline:2px solid var(--action);outline-offset:2px}
.check{display:flex;gap:.5rem;align-items:center;margin:.25rem 0 .75rem}
.summary{display:flex;justify-content:space-between;padding:.25rem 0}
button{width:100%;padding:.75rem 1rem;font:inherit;font-weight:600;border:0;border-radius:.5rem;background:var(--action);color:var(--on-primary)}
button:disabled{opacity:.6}[hidden]{display:none!important}
.error{padding:.75rem;margin-bottom:1rem;border-radius:.5rem;background:var(--danger-soft);color:var(--danger)}
.thanks{background:var(--success-soft);color:var(--success);border-color:var(--success)}`;

const PAYMENT_SECTION = `<section class="card">
<h2>পেমেন্ট / Payment</h2>
<p class="hint">ডেলিভারির সময় টাকা দেবেন (ক্যাশ অন ডেলিভারি)। / Pay cash on delivery.</p>
<div class="summary"><span>ডেলিভারি চার্জ / Delivery charge</span><span id="charge">-</span></div>
<p class="hint">মোট টাকা অর্ডারের পর দেখানো হবে। / The total is shown after you order.</p>
</section>`;

type Variant = OrderLinkView['product']['variants'][number];

export function orderLinkPage(
  view: OrderLinkView,
  { nonce, idempotencyKey }: { nonce: string; idempotencyKey: string },
): string {
  const { storeName, product, districts, botCheckSiteKey } = view;
  const firstOpen = product.variants.find((variant) => isOrderable(product, variant));
  const photo = (firstOpen ?? product.variants[0])?.photoUrl;
  const variantRows = product.variants
    .map((variant) => variantRow(product, variant, variant === firstOpen))
    .join('');
  const districtOptions = districts
    .map(
      ({ id, name, nameBn, chargePoisha }) =>
        `<option value="${id}" data-charge="${formatMoney(chargePoisha)}">${escapeHtml(nameBn ?? name)} (${escapeHtml(name)}) - ${formatMoney(chargePoisha)}</option>`,
    )
    .join('');
  const widget = botCheckSiteKey
    ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(botCheckSiteKey)}"></div>
<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : '';

  return `<!doctype html>
<html lang="bn">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(product.name)} - ${escapeHtml(storeName)}</title>
<style>${STYLE}</style></head>
<body><main>
<header><span class="mark" aria-hidden="true">${escapeHtml([...storeName][0] ?? '')}</span><h1>${escapeHtml(storeName)}</h1></header>
<div id="thanks" class="card thanks" role="status" hidden></div>
<form id="order" novalidate>
<section class="card">
${photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="${escapeHtml(product.name)}">` : ''}
<h2>${escapeHtml(product.name)}</h2>
<div role="radiogroup" aria-label="সাইজ বা ধরন / Size or type">${variantRows}</div>
<label class="field">পরিমাণ / Quantity
<select name="quantity">${quantityOptions(product, firstOpen)}</select></label>
</section>
<section class="card">
<h2>আপনার তথ্য / Your details</h2>
<label class="field">নাম / Name<input type="text" name="buyerName" autocomplete="name" maxlength="120" required></label>
<label class="field">মোবাইল নম্বর / Mobile number<input type="tel" name="buyerPhone" inputmode="numeric" autocomplete="tel" placeholder="01XXXXXXXXX" required></label>
<label class="check"><input type="checkbox" name="otherRecipient"> অন্য কেউ পণ্য নেবেন / Someone else will receive it</label>
<div id="recipient" hidden>
<label class="field">প্রাপকের নাম / Recipient name<input type="text" name="recipientName" maxlength="120"></label>
<label class="field">প্রাপকের মোবাইল / Recipient mobile<input type="tel" name="recipientPhone" inputmode="numeric" placeholder="01XXXXXXXXX"></label>
</div>
<label class="field">ঠিকানা / Address<textarea name="address" maxlength="500" required></textarea></label>
<label class="field">জেলা / District
<select name="areaId" required><option value="">জেলা বাছাই করুন / Choose a district</option>${districtOptions}</select></label>
</section>
${PAYMENT_SECTION}
<div id="error" class="error" role="alert" hidden></div>
${widget}
<noscript><p class="error">অর্ডার করতে JavaScript চালু করুন। / Turn on JavaScript to order.</p></noscript>
<input type="hidden" name="idempotencyKey" value="${idempotencyKey}">
<button type="submit" id="submit">অর্ডার করুন / Place order</button>
</form>
<script nonce="${nonce}">${SCRIPT}</script>
</main></body>
</html>`;
}

function isOrderable(product: OrderLinkView['product'], variant: Variant): boolean {
  return !product.isStockTracked || variant.available > 0;
}

function variantRow(product: OrderLinkView['product'], variant: Variant, checked: boolean): string {
  const orderable = isOrderable(product, variant);
  const note = stockNote(product, variant, orderable);
  return `<div class="variant${orderable ? '' : ' soldout'}"><label><input type="radio" name="variantId" value="${variant.id}" data-max="${product.isStockTracked ? Math.min(variant.available, 10) : 10}"${checked ? ' checked' : ''}${orderable ? '' : ' disabled'}>
<span>${escapeHtml(variant.title)}<br>${note}</span></label><strong>${formatMoney(variant.pricePoisha)}</strong></div>`;
}

function stockNote(product: OrderLinkView['product'], variant: Variant, orderable: boolean) {
  if (!orderable) return '<span class="low">স্টক শেষ / Sold out</span>';
  if (product.isStockTracked && variant.available <= 5)
    return `<span class="low">আর মাত্র ${variant.available}টি / Only ${variant.available} left</span>`;
  return '';
}

function quantityOptions(product: OrderLinkView['product'], first?: Variant): string {
  const max = first && product.isStockTracked ? Math.min(first.available, 10) : 10;
  return Array.from(
    { length: Math.max(max, 1) },
    (_, index) => `<option>${index + 1}</option>`,
  ).join('');
}

// The script only reads fields, shows the server's text and posts JSON; it works out no money.
const SCRIPT = `(function(){
var form=document.getElementById('order'),error=document.getElementById('error'),button=document.getElementById('submit');
var thanks=document.getElementById('thanks'),recipient=document.getElementById('recipient');
function field(name){return form.elements[name]}
function fail(message){error.textContent=message;error.hidden=false;error.scrollIntoView({block:'center'})}
field('otherRecipient').addEventListener('change',function(){recipient.hidden=!field('otherRecipient').checked});
field('areaId').addEventListener('change',function(){var o=field('areaId').selectedOptions[0];document.getElementById('charge').textContent=o&&o.dataset.charge?o.dataset.charge:'-'});
Array.prototype.forEach.call(form.querySelectorAll('input[name=variantId]'),function(radio){radio.addEventListener('change',function(){
var max=Number(radio.dataset.max),select=field('quantity'),keep=Math.min(Number(select.value),max);select.innerHTML='';
for(var i=1;i<=max;i++){var o=document.createElement('option');o.textContent=i;select.appendChild(o)}select.value=String(keep)})});
form.addEventListener('submit',function(event){
event.preventDefault();error.hidden=true;
var variant=form.querySelector('input[name=variantId]:checked');
if(!variant)return fail('একটি সাইজ বা ধরন বাছাই করুন। / Choose a size or type.');
var other=field('otherRecipient').checked;
var address={address:field('address').value,areaId:Number(field('areaId').value)};
var token=form.querySelector('[name=cf-turnstile-response]');
var body={botCheckToken:token?token.value:'fake-bot-check-pass',idempotencyKey:field('idempotencyKey').value,variantId:variant.value,quantity:Number(field('quantity').value),
buyer:{name:field('buyerName').value,phone:field('buyerPhone').value},
recipient:other?Object.assign({isBuyer:false,name:field('recipientName').value,phone:field('recipientPhone').value},address):Object.assign({isBuyer:true},address)};
button.disabled=true;
fetch(location.pathname.replace(/\\/$/,'')+'/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
.then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
.then(function(r){
if(r.ok){form.hidden=true;thanks.textContent=r.data.message;thanks.hidden=false;window.scrollTo(0,0);return}
var e=r.data&&r.data.error;fail(e&&e.fields&&e.fields.length?'তথ্য ঠিকভাবে দিন। / Check your details.':(e&&e.message)||'Something went wrong. Try again.');button.disabled=false;
if(window.turnstile)window.turnstile.reset()})
.catch(function(){fail('নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন। / Network problem. Try again.');button.disabled=false})});
})();`;

export function orderLinkClosedPage(): string {
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>এই লিংক কাজ করে না / This link does not work</title>
<style>${STYLE}</style></head>
<body><main><div class="card"><h1>এই লিংক কাজ করে না / This link does not work</h1>
<p>দোকানের সঙ্গে যোগাযোগ করুন। / Please contact the shop.</p></div></main></body></html>`;
}
