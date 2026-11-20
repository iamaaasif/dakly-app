'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@dakly/ui/cn';

const campaignSteps = [
  { id: 'goal', label: 'Goal' },
  { id: 'content', label: 'Content' },
  { id: 'audience', label: 'Audience' },
] as const;
export type CampaignStepId = (typeof campaignSteps)[number]['id'];

export function useCampaignStep() {
  const pathname = usePathname();
  const router = useRouter();
  const requested = useSearchParams().get('step');
  const index = Math.max(
    0,
    campaignSteps.findIndex(({ id }) => id === requested),
  );
  const hrefFor = (id: CampaignStepId) => `${pathname}?step=${id}`;
  return {
    step: campaignSteps[index]!.id,
    previous: campaignSteps[index - 1]?.id,
    next: campaignSteps[index + 1]?.id,
    hrefFor,
    goTo: (id: CampaignStepId) => router.push(hrefFor(id)),
  };
}

export function CampaignStepper({
  current,
  hrefFor,
}: {
  current: CampaignStepId;
  hrefFor: (id: CampaignStepId) => string;
}) {
  const currentIndex = campaignSteps.findIndex(({ id }) => id === current);
  return (
    <nav aria-label="Campaign steps">
      <ol className="grid grid-cols-3 gap-3">
        {campaignSteps.map(({ id, label }, index) => (
          <li key={id}>
            <Link
              href={hrefFor(id)}
              aria-current={id === current ? 'step' : undefined}
              className="block space-y-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'block h-1 rounded-full',
                  index <= currentIndex ? 'bg-primary' : 'bg-border',
                )}
              />
              <span
                className={cn(
                  'block text-sm',
                  id === current ? 'font-semibold text-action' : 'text-text-muted',
                )}
              >
                {index + 1}. {label}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
