'use client';

import { Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { EmptyState } from '@dakly/ui/empty-state';

import { useCreateAutomation } from '../api/automation-actions';
import { workflowTemplates } from '../workflow-library';
import { TemplateCard } from './workflow-template-card';

// The three templates for comments and chats, the first flows a shop usually wants.
const starterKeys = ['comment_to_dm_price', 'price_question_in_chat', 'order_intent_follow_up'];
const starters = workflowTemplates.filter(({ key }) => starterKeys.includes(key));

export function AutomationsEmpty({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const action = useCreateAutomation();
  return (
    <section
      aria-label="Start your first workflow"
      className="rounded-lg border border-border bg-surface"
    >
      <EmptyState
        icon={Workflow}
        title="You have no workflows yet"
        description={
          canEdit
            ? 'Start from one of these. Each comes with the trigger, timing and messages set up, and you can change anything before it runs.'
            : 'Workflows send messages on their own. Ask the shop owner to set one up.'
        }
        className="pb-6"
      />
      {canEdit && (
        <div className="space-y-3 px-4 pb-6 md:px-6">
          {action.error && (
            <p role="alert" className="text-danger">
              {action.error.message}
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-3">
            {starters.map((template) => (
              <TemplateCard
                key={template.key}
                template={template}
                inUse={false}
                pending={action.isPending}
                onUse={() =>
                  action.mutate(
                    { name: template.name, templateKey: template.key },
                    { onSuccess: (workflow) => router.push(`/automations/${workflow.id}/canvas`) },
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
