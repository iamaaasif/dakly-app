'use client';
import { Sparkles } from 'lucide-react';

import type { AiFeedbackQuery } from '@dakly/contracts/ai-feedback';
import { Sheet } from '@dakly/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { agentTabs, type AgentTab } from '../agent-tabs';
import { AgentSettingsTab } from './agent-settings-tab';
import { FeedbackTab } from './feedback-tab';
import { GoLivePanel } from './go-live-panel';
import { KnowledgeTab } from './knowledge-tab';
import { TestAgentTab } from './test-agent-tab';
import { useSessionContext } from '@/lib/session-context';

const tabLabels: Record<AgentTab, string> = {
  settings: 'Settings',
  knowledge: 'Knowledge',
  feedback: 'Feedback',
  test: 'Test the agent',
};

type AiAgentDrawerProps = {
  tab: AgentTab | undefined;
  feedbackFilter: AiFeedbackQuery['filter'] | undefined;
  onFeedbackFilterChange: (filter: AiFeedbackQuery['filter']) => void;
  onTabChange: (tab: AgentTab) => void;
  onClose: () => void;
};

export function AiAgentDrawer({
  tab,
  feedbackFilter,
  onFeedbackFilterChange,
  onTabChange,
  onClose,
}: AiAgentDrawerProps) {
  const { data } = useSessionContext();
  const canEdit = Boolean(data?.currentStore?.canEditStoreSettings);
  const canEditChats = Boolean(data?.currentStore?.canEditChats);
  return (
    <Sheet
      open={tab !== undefined}
      onClose={onClose}
      width="wide"
      title="Dakly AI agent"
      description="Answers Messenger, Instagram and WhatsApp day and night, takes orders, and calls your team when a person is needed."
      icon={
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-inverse text-on-primary">
          <Sparkles aria-hidden="true" size={18} strokeWidth={1.75} />
        </span>
      }
    >
      <Tabs value={tab ?? 'settings'} onValueChange={(next) => onTabChange(next as AgentTab)}>
        <TabsList aria-label="AI agent sections" className="-mx-6 px-6">
          {agentTabs.map((name) => (
            <TabsTrigger key={name} value={name}>
              {tabLabels[name]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="settings">
          <AgentSettingsTab canEdit={canEdit} />
          <GoLivePanel canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="knowledge">
          <KnowledgeTab canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackTab
            filter={feedbackFilter ?? 'bad'}
            canFix={canEditChats}
            onFilterChange={onFeedbackFilterChange}
          />
        </TabsContent>
        <TabsContent value="test">
          <TestAgentTab canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </Sheet>
  );
}
