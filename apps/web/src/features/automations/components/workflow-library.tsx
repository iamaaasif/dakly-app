'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { CreateAutomationInput } from '@dakly/contracts/automations';
import { templateCategories, templateGoals } from '@dakly/contracts/automations/templates';
import { campaignChannels } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useAutomationAction } from '../api/automation-actions';
import { useAutomations } from '../api/automations';
import { channelLabels } from '../automation-labels';
import {
  emptyWorkflow,
  templateGoalLabels,
  templateTypeLabels,
  workflowTemplates,
  type WorkflowTemplateCard,
} from '../workflow-library';
import { TemplateCard } from './workflow-template-card';

const groups = [
  {
    key: 'type',
    name: 'Type',
    options: templateCategories.map((value) => ({ value, label: templateTypeLabels[value] })),
  },
  {
    key: 'goal',
    name: 'Goal',
    options: templateGoals.map((value) => ({ value, label: templateGoalLabels[value] })),
  },
  {
    key: 'channel',
    name: 'Channel',
    options: campaignChannels.map((value) => ({ value, label: channelLabels[value] })),
  },
] as const;

type Facet = (typeof groups)[number]['key'];

function matches(template: WorkflowTemplateCard, facet: Facet, value: string) {
  if (value === 'all') return true;
  if (facet === 'type') return template.category === value;
  if (facet === 'goal') return template.libraryGoal === value;
  return template.channels.some((channel) => channel === value);
}

type Selected = (facet: Facet) => string;
type Create = (draft: CreateAutomationInput) => void;

function filteredTemplates(selected: Selected, except?: Facet) {
  return workflowTemplates.filter((item) =>
    groups.every(({ key }) => key === except || matches(item, key, selected(key))),
  );
}

export function WorkflowLibrary() {
  const router = useRouter();
  const search = useSearchParams();
  const action = useAutomationAction();
  const workflows = useAutomations();
  const selected: Selected = (facet) => {
    const value = search.get(facet);
    const group = groups.find(({ key }) => key === facet);
    return value && group?.options.some((option) => option.value === value) ? value : 'all';
  };
  const activeTemplates = new Set(
    workflows.data?.items
      .filter(({ status }) => status === 'active')
      .map(({ templateKey }) => templateKey),
  );
  function choose(facet: Facet, value: string) {
    const query = new URLSearchParams(search);
    if (value === 'all') query.delete(facet);
    else query.set(facet, value);
    router.push(query.size ? `/automations/new?${query}` : '/automations/new', { scroll: false });
  }
  function create(draft: CreateAutomationInput) {
    action.mutate(
      { draft },
      {
        onSuccess: (workflow) => {
          if (workflow) router.push(`/automations/${workflow.id}`);
        },
      },
    );
  }
  return (
    <main className="min-h-screen bg-surface-muted">
      <LibraryHeader
        pending={action.isPending}
        onCreate={() => create({ name: 'Untitled workflow', graph: emptyWorkflow })}
      />
      <div className="mx-auto grid max-w-7xl gap-6 p-4 md:grid-cols-[12rem_minmax(0,1fr)] md:p-8">
        <LibraryFilters selected={selected} choose={choose} />
        <LibraryResults
          results={filteredTemplates(selected)}
          activeTemplates={activeTemplates}
          pending={action.isPending}
          error={action.error?.message}
          create={create}
        />
      </div>
    </main>
  );
}

function LibraryHeader({ pending, onCreate }: { pending: boolean; onCreate: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <Link
          href="/automations"
          aria-label="Back to Automations"
          className="grid size-10 place-items-center rounded-md border border-input-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <h1 className="font-bold">Create workflow</h1>
      </div>
      <Button variant="secondary" disabled={pending} onClick={onCreate}>
        Create from scratch
      </Button>
    </header>
  );
}

function LibraryFilters({
  selected,
  choose,
}: {
  selected: Selected;
  choose: (facet: Facet, value: string) => void;
}) {
  return (
    <aside aria-label="Template filters" className="flex flex-wrap gap-4 md:flex-col">
      {groups.map(({ key, name, options }) => {
        const candidates = filteredTemplates(selected, key);
        return (
          <section key={key} className="min-w-36 space-y-1" aria-label={name}>
            <h2 className="px-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
              {name}
            </h2>
            {[{ value: 'all', label: 'All' }, ...options].map(({ value, label }) => {
              const count = candidates.filter((item) => matches(item, key, value)).length;
              const pressed = selected(key) === value;
              return (
                <Button
                  key={value}
                  variant="secondary"
                  aria-pressed={pressed}
                  aria-label={`${label} ${count}`}
                  className={cn(
                    'w-full justify-between border-0 px-2',
                    pressed ? 'bg-primary-soft text-action' : 'bg-transparent',
                  )}
                  onClick={() => choose(key, value)}
                >
                  {label}
                  <span className="text-xs tabular-nums">{count}</span>
                </Button>
              );
            })}
          </section>
        );
      })}
    </aside>
  );
}

function LibraryResults({
  results,
  activeTemplates,
  pending,
  error,
  create,
}: {
  results: WorkflowTemplateCard[];
  activeTemplates: Set<string | null>;
  pending: boolean;
  error?: string;
  create: Create;
}) {
  return (
    <section aria-label="Ready-made workflows" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Pick a ready-made workflow</h2>
        <p className="text-sm text-text-muted">
          Each one comes with the trigger, timing, exit conditions and messages set up. You can
          change anything before you start it.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <p className="text-sm">
        {results.length} {results.length === 1 ? 'workflow' : 'workflows'}
      </p>
      {results.length === 0 && (
        <p className="text-text-muted">Choose different filters to see workflows.</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {results.map((template) => (
          <TemplateCard
            key={template.key}
            template={template}
            inUse={activeTemplates.has(template.key)}
            pending={pending}
            onUse={() =>
              create({ name: template.name, graph: template.graph, templateKey: template.key })
            }
          />
        ))}
      </div>
    </section>
  );
}
