import { Bell, BellRing } from 'lucide-react';

import { Button } from '@dakly/ui/button';

import { usePlatformInterests, useSetPlatformInterest } from '../api/platform-interests';

export function NotifyMeButton() {
  const interests = usePlatformInterests();
  const set = useSetPlatformInterest('tiktok');
  // Until the answer is known the button stays off, so a second tap cannot undo a saved request.
  if (!interests.data) return null;
  const isAsked = interests.data.platforms.includes('tiktok');
  const Icon = isAsked ? BellRing : Bell;
  return (
    <div className="ml-auto text-right">
      <Button
        variant="secondary"
        aria-pressed={isAsked}
        loading={set.isPending}
        onClick={() => set.mutate(!isAsked)}
      >
        <Icon aria-hidden="true" size={16} strokeWidth={1.75} />{' '}
        {isAsked ? 'We’ll tell you' : 'Notify me'}
      </Button>
      {set.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {set.error.message}
        </p>
      )}
    </div>
  );
}
