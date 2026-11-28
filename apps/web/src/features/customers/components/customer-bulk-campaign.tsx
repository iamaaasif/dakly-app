'use client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';

import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { useToast } from '@dakly/ui/toast';

import { useCreateHandPickedSegment } from '../api/hand-picked-segments';

type CustomerBulkCampaignProps = { contactIds: string[] };

// The ticked customers become the audience of one new campaign. Saving them as a segment is
// optional; either way the audience step applies the same consent and frequency checks.
export function CustomerBulkCampaign({ contactIds }: CustomerBulkCampaignProps) {
  const router = useRouter();
  const showToast = useToast();
  const create = useCreateHandPickedSegment();
  const [save, setSave] = useState(false);
  const [name, setName] = useState('');
  const checkId = useId();
  const typed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { contactIds, ...(save && { name: typed }) },
      {
        onSuccess: (segment) => router.push(`/campaigns/new?segment=${segment.id}`),
        onError: (error) => showToast(error.message),
      },
    );
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="link" className="px-3 text-on-primary hover:no-underline">
          Send campaign
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-text-secondary">
            Send a campaign to these {formatCount(contactIds.length)} customers.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkId}
              checked={save}
              onCheckedChange={(value) => setSave(value === true)}
            />
            <label htmlFor={checkId} className="text-sm">
              Save as segment
            </label>
          </div>
          {save ? (
            <Input
              aria-label="Segment name"
              value={name}
              maxLength={80}
              placeholder="Segment name"
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}
          <Button type="submit" disabled={create.isPending || (save && !typed)}>
            Continue
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
