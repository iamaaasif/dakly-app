'use client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useBrandProfile } from '../api/brand-profile';
import { BrandProfileForm } from './brand-profile-form';
import { useSessionContext } from '@/lib/session-context';

export function BrandProfileTab() {
  const profile = useBrandProfile();
  const { data: session } = useSessionContext();
  if (profile.error)
    return (
      <QueryError
        message={profile.error.message}
        onRetry={() => void profile.refetch()}
        retryLabel="Retry Brand profile"
      />
    );
  if (!profile.data)
    return (
      <div role="status" className="space-y-4">
        <span className="sr-only">Loading Brand profile</span>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  return (
    <BrandProfileForm
      profile={profile.data}
      canEdit={Boolean(session?.currentStore?.canEditSocial)}
    />
  );
}
