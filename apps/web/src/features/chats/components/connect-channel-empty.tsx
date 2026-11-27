import { Plus } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

// Shown instead of the inbox until the shop has connected a channel, as in the Figma Inbox frame.
export function ConnectChannelEmpty() {
  return (
    <main
      data-full-width
      className="min-h-[calc(100dvh-6.5625rem)] bg-background p-4 md:min-h-[calc(100dvh-3.5625rem)] md:p-12"
    >
      <section
        aria-label="Connect your channel"
        className="shadow-sm flex min-h-[26rem] flex-col items-center justify-center gap-8 rounded-lg border border-border bg-surface px-4 py-6"
      >
        <div className="flex w-full max-w-[31rem] flex-col items-center gap-6 text-center">
          <InboxDownloadIcon />
          <div className="flex w-full flex-col gap-2">
            <h1 className="text-lg leading-6 font-medium text-text">Connect your channel</h1>
            <p className="text-xs leading-4 text-text-muted">
              Once you connect your channels, inbox will be visible here
            </p>
          </div>
        </div>
        <Link
          href="/integrations"
          className={cn(
            buttonVariants(),
            'min-h-0 gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold hover:bg-primary-hover',
            'h-[2.375rem]',
          )}
        >
          <Plus aria-hidden="true" size={16} />
          Connect with Channel
        </Link>
      </section>
    </main>
  );
}

function InboxDownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      width="70"
      height="70"
      viewBox="0 0 70 70"
      fill="currentColor"
      className="m-[5px] text-text-subtle"
    >
      <path d="M17.0703 17.5C13.3103 17.5 9.88643 19.7233 8.35935 23.1592L0.214826 41.4844C0.0378259 41.8499 7.62939e-05 42.1853 7.62939e-05 42.5V62.5C7.62939e-05 66.6118 3.38833 70 7.50008 70H62.5001C66.6118 70 70.0001 66.6118 70.0001 62.5V42.5C70.0001 42.165 69.9366 41.8648 69.7841 41.4844C67.0658 35.3786 64.3535 29.2677 61.6394 23.1591C60.1135 19.7233 56.6897 17.5 52.9297 17.5H47.5C46.1193 17.5 45 18.6193 45 20C45 21.3807 46.1193 22.5 47.5 22.5H52.9297C54.7266 22.5 56.3405 23.5484 57.0703 25.1904L63.6523 40H52.0019C49.5031 40 47.2221 41.4763 46.1963 43.7549L43.7451 49.1943C43.5217 49.6906 43.0442 50 42.5 50H27.5C26.9558 50 26.4783 49.6906 26.2549 49.1943L23.8037 43.7549C22.7779 41.4763 20.4969 40 17.998 40H6.34763L12.9297 25.1904C13.6595 23.5484 15.2734 22.5 17.0703 22.5H22.5C23.8807 22.5 25 21.3807 25 20C25 18.6193 23.8807 17.5 22.5 17.5H17.0703ZM4.99998 45H17.998C18.5422 45 19.0197 45.3094 19.2432 45.8057L21.6943 51.2451C22.7201 53.5237 25.0011 55 27.5 55H42.5C44.9988 55 47.2798 53.5237 48.3056 51.2451L50.7568 45.8057C50.9802 45.3094 51.4577 45 52.0019 45H65V62.5C65 63.9282 63.9282 65 62.5 65H7.49998C6.07173 65 4.99998 63.9282 4.99998 62.5V45Z" />
      <path d="M35 0C33.6193 0 32.5 1.11929 32.5 2.5V33.9648L29.2676 30.7324C28.1776 29.6579 26.736 29.7288 25.7324 30.7324C24.7564 31.7087 24.7564 33.2913 25.7324 34.2676L33.2324 41.7676C34.2087 42.7435 35.7912 42.7435 36.7676 41.7676L44.2676 34.2676C45.2436 33.2913 45.2436 31.7087 44.2676 30.7324C43.2913 29.7564 41.7087 29.7564 40.7324 30.7324L37.5 33.9648V2.5C37.5 1.11929 36.3807 0 35 0Z" />
    </svg>
  );
}
