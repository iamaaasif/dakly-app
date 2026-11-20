'use client';

import type { ContentStudioTab } from '../content-studio-view';
import { ContentStudioTabs } from './content-studio-tabs';
import { CreateTab } from './create-tab';

export function ContentStudioScreen({ tab }: { tab: ContentStudioTab }) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-xl font-bold md:text-2xl">AI Content Studio</h1>
        <p className="mt-1 text-text-muted">
          Write posts, messages and product descriptions in Bangla or English, in your shop’s voice.
          Then post, send or save them.
        </p>
      </header>
      <ContentStudioTabs tab={tab} />
      {tab === 'create' && <CreateTab />}
    </main>
  );
}
