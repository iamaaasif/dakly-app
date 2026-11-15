import Link from 'next/link';

import { MembersScreen } from './members-screen';
import { RolesScreen } from './roles-screen';
import { StorePage } from '@/components/store-page';

export function TeamScreen({ tab, cursor }: { tab: 'members' | 'roles'; cursor?: string }) {
  return (
    <StorePage permission="canViewTeam">
      <main className="space-y-6 p-4 md:p-8">
        <h1 className="text-xl font-bold">Team</h1>
        <nav aria-label="Team sections" className="flex flex-wrap gap-4">
          {(['members', 'roles'] as const).map((item) => (
            <Link
              key={item}
              href={`/team?tab=${item}`}
              aria-current={tab === item ? 'page' : undefined}
              className="inline-flex min-h-10 items-center text-action underline"
            >
              {item === 'members' ? 'Members' : 'Roles'}
            </Link>
          ))}
          <Link
            href="/team/ownership"
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Ownership transfer
          </Link>
        </nav>
        {tab === 'roles' ? <RolesScreen cursor={cursor} /> : <MembersScreen cursor={cursor} />}
      </main>
    </StorePage>
  );
}
