'use client';

import type { ContentStudioView } from '../content-studio-view';
import { BrandProfileTab } from './brand-profile-tab';
import { ContentStudioTabs } from './content-studio-tabs';
import { CreateTab } from './create-tab';
import { CreditsMeter } from './credits-meter';
import { LibraryTab } from './library-tab';

export function ContentStudioScreen({ view }: { view: ContentStudioView }) {
  return (
    <main className="space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">AI Content Studio</h1>
          <p className="mt-1 text-text-muted">
            Write posts, messages and product descriptions in Bangla or English, in your shop’s
            voice. Then post, send or save them.
          </p>
        </div>
        <CreditsMeter />
      </header>
      <ContentStudioTabs tab={view.tab} />
      {view.tab === 'create' && <CreateTab />}
      {view.tab === 'library' && <LibraryTab view={view} />}
      {view.tab === 'brand' && <BrandProfileTab />}
    </main>
  );
}
