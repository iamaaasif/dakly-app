import Image from 'next/image';

const dimensions = {
  folders: 20,
  copy: 14,
  whatsapp: 18,
  lead: 15,
  order: 15,
  all: 16,
  mine: 16,
  ai: 16,
  snoozed: 16,
  resolved: 16,
  label: 16,
  remind: 16,
  done: 16,
  'saved-replies': 16,
  send: 16,
  sort: 16,
  search: 16,
  assign: 16,
  handoff: 16,
  'back-ai': 16,
  chat: 16,
  filter: 16,
  'not-customer': 16,
} as const;

export function InboxIcon({ name }: { name: keyof typeof dimensions }) {
  const size = dimensions[name];
  return (
    <Image
      alt=""
      aria-hidden="true"
      unoptimized
      className="shrink-0"
      src={`/chats/inbox/${name}.${name === 'whatsapp' ? 'png' : 'svg'}`}
      width={size}
      height={size}
    />
  );
}
