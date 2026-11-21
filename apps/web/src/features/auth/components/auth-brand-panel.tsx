import { ShieldCheck, Sparkles, Users } from 'lucide-react';

const points = [
  {
    icon: Users,
    title: 'Every customer in one place',
    text: 'Import from Excel, Shopify, WooCommerce or your Facebook inbox.',
  },
  {
    icon: Sparkles,
    title: 'AI that writes in Bangla',
    text: 'Campaigns, captions and replies in Bangla, English or Banglish.',
  },
  {
    icon: ShieldCheck,
    title: 'Pay the local way',
    text: 'bKash, Nagad or card, with VAT invoices for your records.',
  },
];
export function AuthBrandPanel() {
  return (
    <aside className="hidden flex-col justify-between bg-primary-soft/50 px-8 py-8 lg:flex">
      <p className="flex items-center gap-3 text-md font-bold">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-lg text-on-primary"
        >
          D
        </span>
        <span>
          Dakly <span className="text-action">AI</span>
        </span>
      </p>
      <div className="max-w-md space-y-6">
        <p className="text-2xl font-bold">
          Call customers.
          <br />
          Grow sales.
        </p>
        <p className="text-md font-normal text-text-muted">
          Keep every customer in one place, send campaigns on SMS, WhatsApp and Facebook, and let
          Dakly AI tell you who to contact next.
        </p>
        <ul className="space-y-4">
          {points.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-action">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-text-muted">© 2026 Dakly Technologies Ltd. · Dhaka, Bangladesh</p>
    </aside>
  );
}
