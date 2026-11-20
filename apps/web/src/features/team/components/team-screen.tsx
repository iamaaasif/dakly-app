import Link from 'next/link';

import { cn } from '@dakly/ui/cn';

import { MembersScreen } from './members-screen';
import { RolesScreen } from './roles-screen';
import { StorePage } from '@/components/store-page';

export function TeamScreen({ tab, cursor }: { tab: 'members' | 'roles'; cursor?: string }) {
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
            <Link
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
            </Link>
          ))}
          <Link
            href="/team/ownership"
            className="-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent px-1 text-sm font-medium text-text-muted hover:text-text"
          >
            Ownership transfer
          </Link>
        </nav>
        {tab === 'roles' ? <RolesScreen cursor={cursor} /> : <MembersScreen cursor={cursor} />}
      </main>
    </StorePage>
  );
}
