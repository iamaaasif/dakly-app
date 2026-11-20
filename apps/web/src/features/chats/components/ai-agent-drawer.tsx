'use client';
import { Sparkles } from 'lucide-react';

import { Sheet } from '@dakly/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { agentTabs, type AgentTab } from '../agent-tabs';
import { AgentSettingsTab } from './agent-settings-tab';
import { useSessionContext } from '@/lib/session-context';

const tabLabels: Record<AgentTab, string> = { settings: 'Settings' };

type AiAgentDrawerProps = {
  tab: AgentTab | undefined;
  onTabChange: (tab: AgentTab) => void;
  onClose: () => void;
};

export function AiAgentDrawer({ tab, onTabChange, onClose }: AiAgentDrawerProps) {
  const { data } = useSessionContext();
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
          <AgentSettingsTab canEdit={Boolean(data?.currentStore?.canEditStoreSettings)} />
        </TabsContent>
      </Tabs>
    </Sheet>
  );
}
