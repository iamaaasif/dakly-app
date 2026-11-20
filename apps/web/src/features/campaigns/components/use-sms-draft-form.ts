import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

import {
  campaignDetailsSchema,
  smsCampaignContentSchema,
  type CampaignResponse,
} from '@dakly/contracts/campaigns';

import { useSaveCampaign } from '../api/save-campaign';

const draftSchema = campaignDetailsSchema.extend({ content: smsCampaignContentSchema });
export type SmsDraftInput = z.input<typeof draftSchema>;
type SmsDraft = z.output<typeof draftSchema>;

function valuesOf(campaign: CampaignResponse): SmsDraftInput {
  return {
    name: campaign.name,
    goal: campaign.goal,
    content: smsCampaignContentSchema.parse(campaign.content),
  };
}

export function useSmsDraftForm(campaign: CampaignResponse, onSaved?: () => void) {
  const save = useSaveCampaign();
  const form = useForm<SmsDraftInput, unknown, SmsDraft>({
    resolver: zodResolver(draftSchema, {
      error: (issue) =>
        issue.path?.[0] === 'name' && issue.code === 'too_small'
          ? 'Enter a campaign name.'
          : undefined,
    }),
    defaultValues: valuesOf(campaign),
  });
  const { dirtyFields, isDirty } = form.formState;
  // Continue saves what changed, then moves on; Save draft saves and stays.
  const saveThen = (afterSave?: () => void) =>
    form.handleSubmit((input) => {
      const change = {
        ...(dirtyFields.name && { name: input.name }),
        ...(dirtyFields.goal && { goal: input.goal }),
        ...(dirtyFields.content && { content: input.content }),
      };
      if (!Object.keys(change).length) return afterSave?.();
      save.mutate(
        { id: campaign.id, input: change },
        {
          onSuccess: (saved) => {
            form.reset(valuesOf(saved));
            afterSave?.();
          },
        },
      );
    });
  return { form, submit: saveThen(onSaved), saveDraft: saveThen(), save, isDirty };
}
