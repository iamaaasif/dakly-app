'use client';

import { useMemo, useState } from 'react';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useRenameAutomation } from '../api/automation-settings';
import { useAutomation, useStepStats, useTriggerPreview } from '../api/automations';
import { statusLabels } from '../automation-labels';
import { useCanvasParam } from '../use-canvas-param';
import { useWorkflowEditor } from '../use-workflow-editor';
import { type CanvasLayout, layoutWorkflow } from '../workflow-canvas-layout';
import { checkWorkflow, type WorkflowCheck } from '../workflow-checks';
import type { CanvasEditing } from './workflow-canvas-nodes';
import { WorkflowCanvasViewport } from './workflow-canvas-viewport';
import { WorkflowChecksPanel } from './workflow-checks-panel';
import { WorkflowEditorHeader } from './workflow-editor-header';
import { WorkflowPageHeader } from './workflow-page-header';
import { WorkflowPalette } from './workflow-palette';
import { WorkflowPublishDialog } from './workflow-publish-dialog';
import { WorkflowSettingsSheet } from './workflow-settings-sheet';
import { WorkflowStatsToggle } from './workflow-stats-toggle';
import { WorkflowStepPanel } from './workflow-step-panel';
import { useSessionContext } from '@/lib/session-context';

export function WorkflowCanvas({ id }: { id: string }) {
  const workflow = useAutomation(id);
  if (workflow.isError && !workflow.data)
    return (
      <QueryError message="Could not load this workflow." onRetry={() => void workflow.refetch()} />
    );
  if (!workflow.data)
    return (
      <p role="status" className="p-4">
        Loading workflow…
      </p>
    );
  return <CanvasScreen key={id} workflow={workflow.data} refresh={workflow.refetch} />;
}

type Refresh = ReturnType<typeof useAutomation>['refetch'];

// Only these triggers have stored events to count.
const countedTriggers = ['consent_given', 'tag_added', 'birthday'];

const hasRecentEntries = (graph: AutomationGraph) => countedTriggers.includes(graph.trigger.key);

function recentEntriesLabel(preview: ReturnType<typeof useTriggerPreview>) {
  if (preview.isError) return 'Could not load';
  if (!preview.data) return '…';
  const { people, atLeast } = preview.data.lastSevenDays;
  return `${formatCount(people)}${atLeast ? '+' : ''} ${people === 1 ? 'person' : 'people'}`;
}

type Editor = ReturnType<typeof useWorkflowEditor>;
type Workflow = AutomationDetailResponse;

function SaveDraftButton({ editor }: { editor: Editor }) {
  return (
    <Button
      variant="secondary"
      disabled={editor.pending || !editor.dirty}
      loading={editor.saving}
      title={editor.dirty ? 'Saves your changes to this draft' : 'No changes to publish'}
      onClick={() => void editor.save()}
    >
      Publish changes
    </Button>
  );
}

function EditorActions({
  workflow,
  editor,
  blocked,
}: {
  workflow: Workflow;
  editor: Editor;
  blocked: boolean;
}) {
  const draft = workflow.status === 'draft';
  const publishLabel = workflow.status === 'paused' ? 'Publish and enable' : 'Publish changes';
  return (
    <>
      {editor.saved && !editor.dirty && (
        <p role="status" className="self-center text-sm text-text-muted">
          Saved
        </p>
      )}
      {draft && <SaveDraftButton editor={editor} />}
      <Button
        disabled={editor.pending || blocked}
        title={blocked ? 'Fix the checks first' : undefined}
        onClick={() => void editor.confirm()}
      >
        {draft ? 'Start workflow' : publishLabel}
      </Button>
    </>
  );
}

function useStats(id: string) {
  const [value, setValue] = useCanvasParam('stats');
  const on = value === '1';
  const query = useStepStats(id, on);
  return {
    stats: on ? query.data?.steps : undefined,
    control: (
      <WorkflowStatsToggle
        on={on}
        failed={query.isError}
        onChange={(next) => setValue(next ? '1' : null)}
      />
    ),
  };
}

function StepPanelHost({
  editor,
  layout,
  stepKey,
  onClose,
}: {
  editor: Editor;
  layout: CanvasLayout;
  stepKey: string | null;
  onClose: () => void;
}) {
  const step = stepKey ? editor.graph.steps[stepKey] : undefined;
  if (!stepKey || !step || step.kind === 'exit') return null;
  return (
    <WorkflowStepPanel
      key={stepKey}
      step={step}
      number={layout.stepNumber(stepKey)}
      onChange={(next) => editor.update(stepKey, next)}
      onClose={onClose}
    />
  );
}

function useCanvasPreview(workflow: Workflow) {
  const counted = countedTriggers.includes(workflow.graph.trigger.key);
  const preview = useTriggerPreview(workflow.id, counted);
  return counted ? recentEntriesLabel(preview) : undefined;
}

function CanvasScreen({ workflow, refresh }: { workflow: Workflow; refresh: Refresh }) {
  const { data } = useSessionContext();
  return data?.currentStore?.canEditAutomations === true ? (
    <EditableCanvas workflow={workflow} refresh={refresh} />
  ) : (
    <div className="flex min-h-screen flex-col bg-background">
      <WorkflowPageHeader title={workflow.name} badge={<StatusBadge workflow={workflow} />}>
        {null}
      </WorkflowPageHeader>
      <ReadOnlyViewport workflow={workflow} />
    </div>
  );
}

function StatusBadge({ workflow }: { workflow: Workflow }) {
  return (
    <Badge variant={workflow.status === 'active' ? 'success' : 'neutral'} className="rounded-full">
      {statusLabels[workflow.status]}
    </Badge>
  );
}

type ViewportProps = {
  workflow: Workflow;
  graph: AutomationGraph;
  layout: CanvasLayout;
  editing?: CanvasEditing;
};

function CanvasMain({ workflow, graph, layout, editing }: ViewportProps) {
  const recentEntries = useCanvasPreview(workflow);
  const { stats, control } = useStats(workflow.id);
  return (
    <main className="relative flex-1">
      <WorkflowCanvasViewport
        graph={graph}
        layout={layout}
        recentEntries={recentEntries}
        editing={editing}
        stats={stats}
        extraControl={control}
      />
    </main>
  );
}

function ReadOnlyViewport({ workflow }: { workflow: Workflow }) {
  const layout = useMemo(
    () => layoutWorkflow(workflow.graph, hasRecentEntries(workflow.graph)),
    [workflow.graph],
  );
  return <CanvasMain workflow={workflow} graph={workflow.graph} layout={layout} />;
}

function EditorAlerts({ renameFailed, error }: { renameFailed: boolean; error?: string }) {
  const messages = [renameFailed ? 'Could not rename this workflow.' : undefined, error].filter(
    (message) => message !== undefined,
  );
  return messages.map((message) => (
    <p key={message} role="alert" className="px-4 pt-2 text-danger">
      {message}
    </p>
  ));
}

function EditorTop({
  workflow,
  editor,
  checks,
  onOpenSettings,
}: {
  workflow: Workflow;
  editor: Editor;
  checks: WorkflowCheck[];
  onOpenSettings: () => void;
}) {
  const rename = useRenameAutomation(workflow.id);
  return (
    <>
      <WorkflowEditorHeader
        name={workflow.name}
        badge={<StatusBadge workflow={workflow} />}
        onOpenSettings={onOpenSettings}
        onRename={(name) =>
          rename.mutateAsync(name).then(
            () => true,
            () => false,
          )
        }
      >
        <EditorActions
          workflow={workflow}
          editor={editor}
          blocked={checks.some((check) => check.level === 'block')}
        />
      </WorkflowEditorHeader>
      <EditorAlerts
        renameFailed={rename.isError}
        error={editor.count === undefined ? editor.error : undefined}
      />
      <WorkflowChecksPanel checks={checks} onFix={(fix) => editor.apply(fix.apply(editor.graph))} />
    </>
  );
}

function EditableCanvas({ workflow, refresh }: { workflow: Workflow; refresh: Refresh }) {
  const editor = useWorkflowEditor(workflow, refresh);
  const [stepKey, openStep] = useCanvasParam('step');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const layout = useMemo(
    () => layoutWorkflow(editor.graph, hasRecentEntries(editor.graph)),
    [editor.graph],
  );
  const checks = useMemo(
    () => checkWorkflow(editor.graph, layout.stepNumber),
    [editor.graph, layout],
  );
  return (
    <div className="flex h-screen flex-col bg-background">
      <EditorTop
        workflow={workflow}
        editor={editor}
        checks={checks}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <WorkflowPalette disabled={!editor.canAdd || editor.pending} onAdd={editor.append} />
        <CanvasMain
          workflow={workflow}
          graph={editor.graph}
          layout={layout}
          editing={{ ...editor, open: openStep }}
        />
      </div>
      <StepPanelHost
        editor={editor}
        layout={layout}
        stepKey={stepKey}
        onClose={() => openStep(null)}
      />
      {settingsOpen && (
        <WorkflowSettingsSheet
          graph={editor.graph}
          onChange={editor.apply}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editor.count !== undefined && (
        <WorkflowPublishDialog
          count={editor.count}
          paused={workflow.status === 'paused'}
          error={editor.error}
          pending={editor.pending}
          onClose={editor.close}
          onPublish={() => void editor.start()}
        />
      )}
    </div>
  );
}
