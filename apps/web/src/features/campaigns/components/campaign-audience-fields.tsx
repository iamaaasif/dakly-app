'use client';

import Link from 'next/link';
import { useFormContext, useWatch } from 'react-hook-form';

import { Checkbox } from '@dakly/ui/checkbox';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCampaignSegments } from '../api/campaign-segments';

type AudienceForm = { includeSegmentIds: string[]; excludeSegmentIds: string[] };
type ListName = keyof AudienceForm;

const maxSegments = 10;

export function CampaignAudienceFields() {
  const segments = useCampaignSegments();
  if (segments.isPending) return <Skeleton className="h-40 w-full" />;
  if (segments.isError) return <p role="alert">Your segments could not load. Try again soon.</p>;
  if (!segments.data.items.length)
    return (
      <p className="text-text-muted">
        You have no segments yet.{' '}
        <Link href="/segments" className="font-medium text-action underline">
          Create a segment
        </Link>{' '}
        to choose who gets this campaign.
      </p>
    );
  const items = segments.data.items;
  return (
    <>
      <SegmentChoices
        name="includeSegmentIds"
        other="excludeSegmentIds"
        legend="Send to"
        hint="People in any of these segments."
        items={items}
      />
      <SegmentChoices
        name="excludeSegmentIds"
        other="includeSegmentIds"
        legend="Leave out"
        hint="People in any of these segments never get this message."
        items={items}
      />
    </>
  );
}

// A segment can be on one list only, and each list holds at most ten, as the API allows.
function SegmentChoices({
  name,
  other,
  legend,
  hint,
  items,
}: {
  name: ListName;
  other: ListName;
  legend: string;
  hint: string;
  items: { id: string; name: string }[];
}) {
  const { control, setValue } = useFormContext<AudienceForm>();
  const chosen = useWatch({ control, name });
  const chosenElsewhere = useWatch({ control, name: other });
  const toggle = (id: string, checked: boolean) =>
    setValue(name, checked ? [...chosen, id] : chosen.filter((value) => value !== id), {
      shouldDirty: true,
    });
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{legend}</legend>
      <p className="text-sm text-text-muted">{hint}</p>
      <ul className="space-y-1">
        {items.map(({ id, name: segmentName }) => {
          const checked = chosen.includes(id);
          const disabled =
            chosenElsewhere.includes(id) || (!checked && chosen.length >= maxSegments);
          return (
            <li key={id}>
              <label className="flex min-h-10 items-center gap-3">
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) => toggle(id, value === true)}
                />
                <span className={disabled ? 'text-text-subtle' : undefined}>{segmentName}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
