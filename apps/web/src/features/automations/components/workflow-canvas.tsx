'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Button, buttonVariants } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useRenameAutomation } from '../api/automation-settings';
import { useAutomation, useTriggerPreview } from '../api/automations';
import { statusLabels } from '../automation-labels';
import { useWorkflowEditor } from '../use-workflow-editor';
import { layoutWorkflow } from '../workflow-canvas-layout';
import { WorkflowCanvasViewport } from './workflow-canvas-viewport';
import { WorkflowEditorHeader } from './workflow-editor-header';
import { WorkflowPageHeader } from './workflow-page-header';
import { WorkflowPalette } from './workflow-palette';
import { WorkflowPublishDialog } from './workflow-publish-dialog';
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

function recentEntriesLabel(preview: ReturnType<typeof useTriggerPreview>) {
  if (preview.isError) return 'Could not load';
  if (!preview.data) return '…';
  const { people, atLeast } = preview.data.lastSevenDays;
  return `${formatCount(people)}${atLeast ? '+' : ''} ${people === 1 ? 'person' : 'people'}`;
}

type Editor = ReturnType<typeof useWorkflowEditor>;
type Workflow = AutomationDetailResponse;

function EditorActions({ workflow, editor }: { workflow: Workflow; editor: Editor }) {
  const draft = workflow.status === 'draft';
  const publishLabel = workflow.status === 'paused' ? 'Publish and enable' : 'Publish changes';
  return (
    <>
      {editor.saved && !editor.dirty && (
        <p role="status" className="self-center text-sm text-text-muted">
          Saved
        </p>
      )}
      {!editor.dirty && (
        <Link
          href={`/automations/${workflow.id}`}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Workflow settings
        </Link>
      )}
      {draft && (
        <Button
          variant="secondary"
          disabled={editor.pending || !editor.dirty}
          loading={editor.saving}
          title={editor.dirty ? 'Saves your changes to this draft' : 'No changes to publish'}
          onClick={() => void editor.save()}
        >
          Publish changes
        </Button>
      )}
      <Button disabled={editor.pending} onClick={() => void editor.confirm()}>
        {draft ? 'Start workflow' : publishLabel}
      </Button>
    </>
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
    <Badge variant={workflow.status === 'active' ? 'success' : 'neutral'}>
      {statusLabels[workflow.status]}
    </Badge>
  );
}

function ReadOnlyViewport({ workflow }: { workflow: Workflow }) {
  const recentEntries = useCanvasPreview(workflow);
  const layout = useMemo(() => layoutWorkflow(workflow.graph), [workflow.graph]);
  return (
    <main className="relative flex-1">
      <WorkflowCanvasViewport
        graph={workflow.graph}
        layout={layout}
        recentEntries={recentEntries}
      />
    </main>
  );
}

function EditableCanvas({ workflow, refresh }: { workflow: Workflow; refresh: Refresh }) {
  const recentEntries = useCanvasPreview(workflow);
  const rename = useRenameAutomation(workflow.id);
  const editor = useWorkflowEditor(workflow, refresh);
  const layout = useMemo(() => layoutWorkflow(editor.graph), [editor.graph]);
  return (
    <div className="flex h-screen flex-col bg-background">
      <WorkflowEditorHeader
        name={workflow.name}
        badge={<StatusBadge workflow={workflow} />}
        onRename={(name) =>
          rename.mutateAsync(name).then(
            () => true,
            () => false,
          )
        }
      >
        <EditorActions workflow={workflow} editor={editor} />
      </WorkflowEditorHeader>
      {rename.isError && (
        <p role="alert" className="px-4 pt-2 text-danger">
          Could not rename this workflow.
        </p>
      )}
      {editor.count === undefined && editor.error && (
        <p role="alert" className="px-4 pt-2 text-danger">
          {editor.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <WorkflowPalette disabled={!editor.canAdd || editor.pending} onAdd={editor.append} />
        <main className="relative flex-1">
          <WorkflowCanvasViewport
            graph={editor.graph}
            layout={layout}
            recentEntries={recentEntries}
            editing={editor}
          />
        </main>
      </div>
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
