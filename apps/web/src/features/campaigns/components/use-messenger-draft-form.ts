import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  campaignDetailsSchema,
  messengerCampaignContentSchema,
  type CampaignResponse,
  type MessengerCampaignContent,
} from '@dakly/contracts/campaigns';
import type { ChannelConnection } from '@dakly/contracts/channels';

import { useSaveCampaign } from '../api/save-campaign';

const draftSchema = campaignDetailsSchema.extend({
  channelConnectionId: z.uuid('Choose a Facebook Page.'),
  content: messengerCampaignContentSchema,
});
export type DraftInput = z.input<typeof draftSchema>;
type Draft = z.output<typeof draftSchema>;

const emptyContent: MessengerCampaignContent = { text: '', imageUrl: null, buttons: [] };
export const selectClass =
  'min-h-10 w-full rounded-md border border-input-border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function valuesOf(campaign: CampaignResponse, pageId: string): DraftInput {
  return {
    name: campaign.name,
    goal: campaign.goal,
    channelConnectionId: pageId,
    content: messengerCampaignContentSchema.parse(campaign.content),
  };
}

// A Page disconnected since the last save is no longer a choice, so the shop picks another.
function startingValues(pages: ChannelConnection[], campaign?: CampaignResponse): DraftInput {
  if (!campaign)
    return { name: '', goal: null, channelConnectionId: pages[0]?.id ?? '', content: emptyContent };
  const kept = pages.some(({ id }) => id === campaign.channelConnectionId);
  return valuesOf(campaign, kept ? (campaign.channelConnectionId ?? '') : '');
}

function errorMessage(issue: { path?: PropertyKey[]; code: string }) {
  if (issue.code !== 'too_small') return undefined;
  if (issue.path?.[0] === 'name') return 'Enter a campaign name.';
  return issue.path?.includes('buttons') ? 'Enter the button text.' : undefined;
}

export function useMessengerDraftForm(
  pages: ChannelConnection[],
  campaign?: CampaignResponse,
  onSaved?: () => void,
) {
  const save = useSaveCampaign();
  const router = useRouter();
  const form = useForm<DraftInput, unknown, Draft>({
    resolver: zodResolver(draftSchema, { error: errorMessage }),
    defaultValues: startingValues(pages, campaign),
  });
  const { dirtyFields, isDirty } = form.formState;
  // Continue saves what changed, then moves on; Save draft saves and stays.
  const saveThen = (afterSave?: () => void) =>
    form.handleSubmit((input) => {
      if (!campaign) {
        const { name, goal, channelConnectionId } = input;
        const created = { name, goal, channel: 'messenger', channelConnectionId } as const;
        save.mutate(
          { input: created },
          { onSuccess: (saved) => router.replace(`/campaigns/${saved.id}`) },
        );
        return;
      }
      const change = {
        ...(dirtyFields.name && { name: input.name }),
        ...(dirtyFields.goal && { goal: input.goal }),
        ...(dirtyFields.channelConnectionId && { channelConnectionId: input.channelConnectionId }),
        ...(dirtyFields.content && { content: input.content }),
      };
      if (!Object.keys(change).length) return afterSave?.();
      save.mutate(
        { id: campaign.id, input: change },
        {
          onSuccess: (saved) => {
            form.reset(valuesOf(saved, saved.channelConnectionId ?? ''));
            afterSave?.();
          },
        },
      );
    });
  const submit = saveThen(onSaved);
  const saveDraft = saveThen();
  return { form, submit, saveDraft, save, isDirty, opening: !campaign && save.isSuccess };
}
