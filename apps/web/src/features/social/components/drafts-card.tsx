import type { PostResponse } from '@dakly/contracts/social';

import type { SocialAccount } from '../api/get-social-accounts';
import { DraftRow } from './draft-row';

type DraftsCardProps = { drafts: PostResponse[]; accounts: SocialAccount[] };

export function DraftsCard({ drafts, accounts }: DraftsCardProps) {
  return (
    <section aria-labelledby="drafts" className="rounded-lg border border-border bg-surface">
      <header className="p-4 md:px-6">
        <h2 id="drafts" className="text-lg font-semibold">
          Drafts
        </h2>
        <p className="text-sm text-text-muted">
          {drafts.length === 1 ? '1 draft' : `${drafts.length} drafts`} · only you can see these
          until you schedule them
        </p>
      </header>
      {drafts.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} accounts={accounts} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-border p-4 text-text-muted md:px-6">
          No drafts yet. A post you save without scheduling appears here.
        </p>
      )}
    </section>
  );
}
