import Image from 'next/image';

import type { MessengerCampaignContent } from '@dakly/contracts/campaigns';

// Messenger shows the image as its own message, then the text with the buttons under it.
export function MessengerPreview({
  pageName,
  content,
}: {
  pageName: string;
  content: Pick<MessengerCampaignContent, 'text' | 'buttons'> & { imageUrl: string | null };
}) {
  const { text, imageUrl, buttons } = content;
  return (
    <section
      aria-label="Message preview"
      className="space-y-2 rounded-lg border border-border bg-surface-muted p-4"
    >
      <p className="text-sm font-semibold">{pageName}</p>
      {imageUrl && (
        <Image
          src={imageUrl}
          alt="Message image"
          width={480}
          height={320}
          unoptimized
          className="max-h-60 w-full rounded-lg object-cover"
        />
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <p className="p-3 text-sm wrap-anywhere whitespace-pre-wrap">
          {text || <span className="text-text-muted">Your message appears here.</span>}
        </p>
        {buttons.map(({ title }, index) => (
          <p
            key={index}
            className="border-t border-border px-3 py-2 text-center text-sm font-semibold text-action"
          >
            {title || 'Button'}
          </p>
        ))}
      </div>
    </section>
  );
}
