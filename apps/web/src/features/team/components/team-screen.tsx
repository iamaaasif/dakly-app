'use client';
import Link from 'next/link';

import { memberListQuerySchema } from '@dakly/contracts/team';
import { cn } from '@dakly/ui/cn';

import { MembersScreen } from './members-screen';
import { RolesScreen } from './roles-screen';
import { StorePage } from '@/components/store-page';
import { UrlLink } from '@/components/url-link';
import { useUrlQuery } from '@/lib/use-url-query';

type TeamScreenProps = { tab: 'members' | 'roles'; cursor?: string };

export function TeamScreen({
  inviteChannel,
  ...initial
}: TeamScreenProps & { inviteChannel: 'phone' | 'email' }) {
  const { tab, cursor } = useUrlQuery(initial, (raw) => {
    const parsed = memberListQuerySchema.safeParse({ cursor: raw.cursor });
    return parsed.success
      ? {
          tab: raw.tab === 'roles' ? ('roles' as const) : ('members' as const),
          cursor: parsed.data.cursor,
        }
      : undefined;
  });
  return (
    <StorePage permission="canViewTeam">
      <main className="space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Team and permissions</h1>
          <p className="mt-1 text-sm text-text-muted">
            Invite people to help run your store, and choose what each of them can see and do.
          </p>
        </div>
        <nav aria-label="Team sections" className="flex gap-6 border-b border-border">
          {(['members', 'roles'] as const).map((item) => (
            <UrlLink
              key={item}
              href={`/team?tab=${item}`}
              aria-current={tab === item ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium transition-colors',
                tab === item
                  ? 'border-action font-semibold text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {item === 'members' ? 'Members' : 'Roles'}
            </UrlLink>
          ))}
          <Link
            href="/team/ownership"
            className="-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent px-1 text-sm font-medium text-text-muted hover:text-text"
          >
            Ownership transfer
          </Link>
        </nav>
        {tab === 'roles' ? (
          <RolesScreen cursor={cursor} />
        ) : (
          <MembersScreen cursor={cursor} inviteChannel={inviteChannel} />
        )}
      </main>
    </StorePage>
  );
}
