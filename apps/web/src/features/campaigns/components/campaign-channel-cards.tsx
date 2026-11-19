import { Facebook, Instagram, MessageCircle, MessageSquare } from 'lucide-react';

import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

const channels = [
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    description: 'Send a message with images and buttons using a Meta-approved template.',
  },
  {
    name: 'SMS',
    icon: MessageSquare,
    description: 'Send a short text to customers who agreed to receive SMS. Works on every phone.',
  },
  {
    name: 'Facebook Messenger',
    icon: Facebook,
    description:
      'Send a photo, message and buttons to people who opted in to updates from your Page.',
  },
  {
    name: 'Instagram DM',
    icon: Instagram,
    description: 'Send a photo and quick replies to people who opted in to updates on Instagram.',
  },
];

export function CampaignChannelCards({
  focusSms,
  onChooseSms,
}: {
  focusSms: boolean;
  onChooseSms: () => void;
}) {
  return (
    <section aria-label="Campaign channels" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {channels.map(({ name, description, icon: Icon }) => (
        <Card key={name} className="flex min-w-0 flex-col items-start gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-lg bg-primary-soft text-action-hover">
            <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
          </span>
          <h2 className="text-lg font-semibold text-action">{name}</h2>
          <p className="flex-1">{description}</p>
          {name === 'SMS' ? (
            <Button variant="secondary" autoFocus={focusSms} onClick={onChooseSms}>
              Create SMS
            </Button>
          ) : (
            <p className="flex min-h-10 items-center text-sm text-text-muted">Connect first</p>
          )}
        </Card>
      ))}
    </section>
  );
}
